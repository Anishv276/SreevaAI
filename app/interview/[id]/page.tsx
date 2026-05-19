"use client";
import { Suspense, useState, use, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Mic2, ShieldCheck, ShieldAlert, Zap, ChevronLeft, ChevronRight, Send, Loader2, Video, VideoOff, MicOff, PhoneOff, CheckCircle2, ArrowRight, Camera, Mic, AlertCircle, LogOut, Eye, EyeOff, Users, Volume2, WifiOff, User, ChevronDown, MessageSquare, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuraVisualizer } from "@/components/agents-ui/aura-visualizer";
import { HardwareCheck } from "@/components/careers/interview/HardwareCheck";
import { FaceProctoring } from "@/components/careers/interview/FaceProctoring";
import { HardwareHeartbeat } from "@/components/careers/interview/HardwareHeartbeat";
import { ConnectionProctoring } from "@/components/careers/interview/ConnectionProctoring";
import { CandidateRatingForm } from "@/components/careers/interview/CandidateRatingForm";
import { FIXED_INTERVIEW_DURATION_MINUTES } from "@/lib/drive-limits";
import { useSearchParams } from "next/navigation";
import { isInterviewTokenRequired } from "@/lib/interview-access";
import { BASIC_PLAN_SIGNALS, normalizeProctoringSignals } from "@/lib/proctoring-signals";
import {
    LiveKitRoom,
    RoomAudioRenderer,
    useLocalParticipant,
    useTracks,
    TrackReference,
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
function getRecordingMimeType(): string {
    if (typeof MediaRecorder === "undefined") return "video/webm";
    const candidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
    ];
    for (const mime of candidates) {
        if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return "video/webm";
}
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
    const [phase, setPhase] = useState<"loading" | "check" | "launching" | "interview" | "finalizing" | "completed">("loading");
    const [bookedSlot, setBookedSlot] = useState<number | null>(null);
    const [endMode, setEndMode] = useState<"normal" | "timeout">("normal");
    const [token, setToken] = useState<string | null>(null);
    const [serverUrl, setServerUrl] = useState<string | null>(null);
    const [isJoining, setIsJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [shouldConnect, setShouldConnect] = useState(false);
    const [interviewEndsAt, setInterviewEndsAt] = useState<number | null>(null);
    const [remainingSeconds, setRemainingSeconds] = useState(0);
    const sessionDurationRef = useRef<number | null>(null);
    const [timerExpired, setTimerExpired] = useState(false);
    const [interviewRoleLabel, setInterviewRoleLabel] = useState<string>("Interview");
    const [candidateDisplayName, setCandidateDisplayName] = useState<string>("Candidate");
    const containerRef = useRef<HTMLDivElement>(null);
    const agentReadyCommittedRef = useRef(false);
    const launchStartedAtRef = useRef<number | null>(null);
    const lkRoomRef = useRef<Room | null>(null);
    const readySignalSentFromParentRef = useRef(false);
    const connectionAttemptRef = useRef(0);
    const launchRecoveryTimerRef = useRef<number | null>(null);
    const [isAgentReady, setIsAgentReady] = useState(false);
    const [agentReadyLatencyMs, setAgentReadyLatencyMs] = useState<number | null>(null);
    const [launchTimeoutCheck, setLaunchTimeoutCheck] = useState(0);
    const [launchRecoveryMessage, setLaunchRecoveryMessage] = useState<string | null>(null);
    const [returnCountdown, setReturnCountdown] = useState<number | null>(null);
    const [isTabViolation, setIsTabViolation] = useState(false);
    const [isFullscreenViolation, setIsFullscreenViolation] = useState(false);
    const [tabSwitchCount, setTabSwitchCount] = useState(0);
    const [tabViolationElapsed, setTabViolationElapsed] = useState<string | null>(null);
    const tabViolationTimerRef = useRef<number | null>(null);
    // Prevents blur + visibilitychange from double-firing on the same tab-switch event
    const tabSwitchInFlightRef = useRef(false);
    // Timestamp (ms) when interview phase started — used to compute elapsed time in proctoring events
    const interviewStartedAtRef = useRef<number | null>(null);
    //  AI Face Proctoring 
    const [referenceSnapshotUrl, setReferenceSnapshotUrl] = useState<string | null>(null);
    // Selected Devices
    const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>();
    const [selectedMicId, setSelectedMicId] = useState<string | undefined>();
    const [faceViolationAlert, setFaceViolationAlert] = useState<{ type: string; reason: string } | null>(null);
    const faceViolationTimerRef = useRef<NodeJS.Timeout | null>(null);
    //  Hardware Heartbeat 
    const [hardwareViolationAlert, setHardwareViolationAlert] = useState<{ type: string; reason: string } | null>(null);
    const hardwareViolationTimerRef = useRef<NodeJS.Timeout | null>(null);
    //  Connection Proctoring 
    const [connectionAlert, setConnectionAlert] = useState<{ eventType: string; reason: string } | null>(null);
    const connectionAlertTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [proctoringSignals, setProctoringSignals] = useState(BASIC_PLAN_SIGNALS);
    const [supportDialogOpen, setSupportDialogOpen] = useState(false);
    const [instructionsDialogOpen, setInstructionsDialogOpen] = useState(false);
    const [supportSubmitting, setSupportSubmitting] = useState(false);
    const [supportSuccess, setSupportSuccess] = useState(false);
    const [supportError, setSupportError] = useState<string | null>(null);
    const [blockedAccessMessage, setBlockedAccessMessage] = useState<string | null>(null);
    const [supportForm, setSupportForm] = useState({
        name: "",
        email: "",
        issueAbout: "",
    });
    const SHOW_BACKGROUND_PROCTORING_ALERTS = false;
    const SHOW_TAB_FULLSCREEN_ALERTS = true;
    const searchParams = useSearchParams();
    const interviewToken = searchParams.get("token") || "";
    const requireInterviewToken = isInterviewTokenRequired();
    const isTabSwitchEnabled = Boolean(proctoringSignals.tab_switch);
    const isCameraDisabledEnabled = Boolean(proctoringSignals.camera_disabled);
    const isMicrophoneDisabledEnabled = Boolean(proctoringSignals.microphone_disabled);
    const isConnectionLostEnabled = Boolean(proctoringSignals.connection_lost);
    const isFaceAbsenceEnabled = Boolean(proctoringSignals.face_absence);
    const isMultipleFacesEnabled = Boolean(proctoringSignals.multiple_faces);
    const isIdentityMismatchEnabled = Boolean(proctoringSignals.identity_mismatch);
    const clearDelayedViolation = useCallback((ref: { current: number | null }) => {
        if (ref.current !== null) {
            window.clearTimeout(ref.current);
            ref.current = null;
        }
    }, []);
    // Load reference snapshot from sessionStorage (set by HardwareCheck after camera capture)
    useEffect(() => {
        try {
            const snap = sessionStorage.getItem("proctor_ref_snapshot");
            if (snap) setReferenceSnapshotUrl(snap);
        } catch { }
    }, []);

    useEffect(() => {
        let isMounted = true;
        fetch(`/api/interview/${id}/slots`)
            .then(res => res.json())
            .then(data => {
                if (!isMounted) return;
                if (data.role) setInterviewRoleLabel(data.role);
                // Force "check" phase even if no slot is booked for testing purposes
                setPhase("check");
                if (data.bookedSlot) {
                    setBookedSlot(data.bookedSlot);
                }
            })
            .catch(() => {
                if (isMounted) {
                    const searchParams = window.location.search;
                    window.location.href = `/interview/${id}/schedule${searchParams}`;
                }
            });
        return () => { isMounted = false; };
    }, [id]);

    //  Face violation handler 
    const handleFaceViolation = useCallback((
        eventType: string,
        reason: string,
        severity?: "low" | "medium" | "high",
        metadata?: Record<string, unknown>,
    ) => {
        if (eventType === "face_absence" && !isFaceAbsenceEnabled) return;
        if (eventType === "multiple_faces" && !isMultipleFacesEnabled) return;
        if (eventType === "identity_mismatch" && !isIdentityMismatchEnabled) return;
        if (SHOW_BACKGROUND_PROCTORING_ALERTS) {
            setFaceViolationAlert({ type: eventType, reason });
            if (faceViolationTimerRef.current) clearTimeout(faceViolationTimerRef.current);
            faceViolationTimerRef.current = setTimeout(() => setFaceViolationAlert(null), 6000);
        }
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
                    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
                }],
            }),
        }).catch(() => { });
    }, [
        id,
        interviewToken,
        isFaceAbsenceEnabled,
        isMultipleFacesEnabled,
        isIdentityMismatchEnabled,
    ]);
    const handleAgentDetectedViolation = useCallback((eventType: string, reason: string, severity?: string) => {
        handleFaceViolation(eventType, reason, severity as "low" | "medium" | "high" | undefined, undefined);
    }, [handleFaceViolation]);
    //  Hardware heartbeat violation handler 
    const handleHardwareViolation = useCallback((
        eventType: string,
        reason: string,
        severity: "low" | "medium" | "high" = "high",
        metadata?: Record<string, unknown>,
    ) => {
        if (eventType === "camera_disabled" && !isCameraDisabledEnabled) return;
        if (eventType === "microphone_disabled" && !isMicrophoneDisabledEnabled) return;
        if (SHOW_BACKGROUND_PROCTORING_ALERTS) {
            setHardwareViolationAlert({ type: eventType, reason });
            if (hardwareViolationTimerRef.current) clearTimeout(hardwareViolationTimerRef.current);
            hardwareViolationTimerRef.current = setTimeout(() => setHardwareViolationAlert(null), 8000);
        }
        fetch("/api/interview/proctoring", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                applicationId: id,
                interviewToken,
                events: [{
                    eventType,
                    severity,
                    timestamp: Date.now(),
                    reason,
                    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
                }],
            }),
        }).catch(() => { });
    }, [id, interviewToken, isCameraDisabledEnabled, isMicrophoneDisabledEnabled]);
    //  Connection violation handler 
    const handleConnectionViolation = useCallback((
        eventType: string,
        reason: string,
        severity: "low" | "medium" | "high" = "medium",
        metadata?: Record<string, unknown>,
    ) => {
        if (eventType === "connection_lost" && !isConnectionLostEnabled) return;
        if (SHOW_BACKGROUND_PROCTORING_ALERTS) {
            const displayMs = severity === "high" ? 9000 : severity === "low" ? 5000 : 8000;
            setConnectionAlert({ eventType, reason });
            if (connectionAlertTimerRef.current) clearTimeout(connectionAlertTimerRef.current);
            connectionAlertTimerRef.current = setTimeout(() => setConnectionAlert(null), displayMs);
        }
        fetch("/api/interview/proctoring", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                applicationId: id,
                interviewToken,
                events: [{
                    eventType,
                    severity,
                    timestamp: Date.now(),
                    reason,
                    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
                }],
            }),
        }).catch(() => { });
    }, [id, interviewToken, isConnectionLostEnabled]);
    const submitSupportRequest = useCallback(async () => {
        const normalizedName = supportForm.name.trim();
        const normalizedEmail = supportForm.email.trim().toLowerCase();
        const normalizedIssueAbout = supportForm.issueAbout.trim();
        if (!normalizedName || !normalizedEmail || !normalizedIssueAbout) {
            setSupportError("Please fill name, email, and issue description.");
            return;
        }
        setSupportSubmitting(true);
        setSupportError(null);
        try {
            const res = await fetch(`/api/interview/${encodeURIComponent(id)}/support`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...supportForm,
                    name: normalizedName,
                    email: normalizedEmail,
                    issueAbout: normalizedIssueAbout,
                    interviewToken,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSupportError(data.error || "Failed to submit support request.");
                return;
            }
            setSupportSuccess(true);
            setSupportForm((prev) => ({
                ...prev,
                issueAbout: "",
            }));
            window.setTimeout(() => {
                setSupportDialogOpen(false);
                setSupportSuccess(false);
            }, 3000);
        } catch {
            setSupportError("Unable to submit support request right now.");
        } finally {
            setSupportSubmitting(false);
        }
    }, [id, interviewToken, supportForm]);
    // Countdown ticker - purely visual, counts up for display purposes
    useEffect(() => {
        if (phase !== "launching") return;
        setLaunchTimeoutCheck(0);
        const timer = window.setInterval(() => {
            setLaunchTimeoutCheck((prev) => prev + 1);
        }, 1000);
        return () => window.clearInterval(timer);
    }, [phase]);
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
        interviewStartedAtRef.current = Date.now();
        setPhase("interview");
    }, [phase, isAgentReady]);
    useEffect(() => {
        if (!candidateDisplayName || candidateDisplayName === "Candidate") return;
        setSupportForm((prev) => (prev.name.trim() ? prev : { ...prev, name: candidateDisplayName }));
    }, [candidateDisplayName]);
    const isExitUnlocked = phase === "completed" || timerExpired;
    const isInterviewLocked = (phase === "interview") && !isExitUnlocked;
    const handleRemoteAgentAudioTrack = useCallback((track: MediaStreamTrack | null) => {
        // Handled by child component
    }, []);
    const tokenRequestRef = useRef<Promise<WarmConnectionResult> | null>(null);
    type WarmConnectionResult =
        | { ok: true }
        | { ok: false; message: string };

    const ensureWarmConnection = useCallback(async (): Promise<WarmConnectionResult> => {
        const requestAttempt = connectionAttemptRef.current;
        if (token && serverUrl && typeof sessionDurationRef.current === "number" && sessionDurationRef.current > 0) {
            return { ok: true };
        }
        if (requireInterviewToken && !interviewToken) {
            console.error("Warm connection failed: missing interview security token in the URL.");
            return { ok: false, message: "This interview link is missing its security token. Please reopen the interview link from your invitation email or dashboard." };
        }
        if (tokenRequestRef.current) {
            return tokenRequestRef.current;
        }
        tokenRequestRef.current = (async () => {
            try {
                const res = await fetch(`/api/interview/${id}/token`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: interviewToken }),
                });
                const data = await res.json();
                if (requestAttempt !== connectionAttemptRef.current) {
                    return { ok: false, message: "Interview connection could not be prepared. Please retry." };
                }
                if (res.ok && data.token && data.url) {
                    setToken(data.token);
                    setServerUrl(data.url);
                    setInterviewRoleLabel(data.roleLabel || data.jobTitle || "Interview");
                    setCandidateDisplayName(data.candidateName || "Candidate");
                    setProctoringSignals(normalizeProctoringSignals(data.proctoringSignals));
                    const fixedDurationSeconds = Math.floor(FIXED_INTERVIEW_DURATION_MINUTES * 60);
                    sessionDurationRef.current = fixedDurationSeconds;
                    setRemainingSeconds(fixedDurationSeconds);
                    console.log("Warm connection prepared.");
                    return { ok: true };
                }
                const apiError = String(data?.error || "Invalid token payload");
                const isFinalized = /already finalized|already completed|completed interview|session has expired|expired|invalid token|invalid token payload|token expiry|token expired/i.test(apiError);
                if (isFinalized) {
                    const blockedMessage = "You have already completed your interview. Please contact the support team at support@sreevaai.com.";
                    return {
                        ok: false,
                        message: blockedMessage,
                    };
                }
                console.warn(
                    "Warm connection failed:",
                    apiError,
                    data?.details || {}
                );
                return { ok: false, message: apiError || "Interview connection could not be prepared. Please retry." };
            } catch (err) {
                console.error("Warm connection request failed:", err);
                return { ok: false, message: "Interview connection could not be prepared. Please retry." };
            } finally {
                tokenRequestRef.current = null;
            }
        })();
        return tokenRequestRef.current;
    }, [id, token, serverUrl, interviewToken, requireInterviewToken]);
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
    const exitFullscreenMode = useCallback(async () => {
        try {
            const doc = document as Document & {
                webkitExitFullscreen?: () => Promise<void> | void;
                mozCancelFullScreen?: () => Promise<void> | void;
                msExitFullscreen?: () => Promise<void> | void;
            };
            const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
            const isFullscreen = !!(
                doc.fullscreenElement ||
                (document as any).webkitFullscreenElement ||
                (document as any).mozFullScreenElement ||
                (document as any).msFullscreenElement
            );
            if (isFullscreen && exit) {
                await exit.call(doc);
            }
        } catch (err) {
            console.warn("Fullscreen exit failed:", err);
        }
    }, []);
    const stopInterviewMedia = useCallback(() => {
        const room = lkRoomRef.current;
        if (!room) return;
        try {
            void room.localParticipant.setCameraEnabled(false).catch(() => { });
        } catch { }
        try {
            void room.localParticipant.setMicrophoneEnabled(false).catch(() => { });
        } catch { }
        try {
            room.disconnect();
        } catch { }
    }, []);
    const resetToHardwareCheck = useCallback(async (message?: string) => {
        if (launchRecoveryTimerRef.current !== null) {
            window.clearTimeout(launchRecoveryTimerRef.current);
            launchRecoveryTimerRef.current = null;
        }
        if (message) {
            // Remove full screen first as requested
            await exitFullscreenMode();
            // Trigger 3s countdown with the message
            setLaunchRecoveryMessage(message);
            setReturnCountdown(3);
            await new Promise<void>((resolve) => {
                let currentCount = 3;
                const interval = window.setInterval(() => {
                    currentCount -= 1;
                    if (currentCount > 0) {
                        setReturnCountdown(currentCount);
                    } else {
                        window.clearInterval(interval);
                        setReturnCountdown(null);
                        resolve();
                    }
                }, 1000);
            });
        } else {
            await exitFullscreenMode();
        }
        stopInterviewMedia();
        setShouldConnect(false);
        setToken(null);
        setServerUrl(null);
        setIsAgentReady(false);
        setAgentReadyLatencyMs(null);
        agentReadyCommittedRef.current = false;
        readySignalSentFromParentRef.current = false;
        launchStartedAtRef.current = null;
        setLaunchTimeoutCheck(0);
        setLaunchRecoveryMessage(null);
        setPhase("check");
    }, [exitFullscreenMode, stopInterviewMedia]);
    // Hard timeout: if agent never becomes ready within 1.5 minutes (90s), show a popup and return to check.
    useEffect(() => {
        if (phase !== "launching") return;
        if (launchTimeoutCheck >= 90 && !agentReadyCommittedRef.current) {
            setJoinError("AI interviewer didn't respond in time. Please reload the website and try again.");
            connectionAttemptRef.current += 1;
            void resetToHardwareCheck("AI interviewer didn't respond in time. Please reload the website and try again.");
        }
    }, [launchTimeoutCheck, phase, resetToHardwareCheck]);
    const handleHardwareComplete = async (devices?: { cameraId?: string; micId?: string }) => {
        if (devices) {
            setSelectedCameraId(devices.cameraId);
            setSelectedMicId(devices.micId);
        }
        setIsJoining(true);
        setJoinError(null);
        setBlockedAccessMessage(null);
        if (!interviewToken && requireInterviewToken) {
            setJoinError("This interview link is missing its security token. Please reopen the interview link from your invitation email or dashboard.");
            setIsJoining(false);
            return;
        }
        // Move the UI into the launching state immediately so the button feels instant.
        connectionAttemptRef.current += 1;
        agentReadyCommittedRef.current = false;
        readySignalSentFromParentRef.current = false;
        launchStartedAtRef.current = performance.now();
        setLaunchRecoveryMessage(null);
        setIsAgentReady(false);
        setAgentReadyLatencyMs(null);
        setPhase("launching");
        void (async () => {
            try {
                void requestFullscreenMode();
                if (lkRoomRef.current) {
                    void lkRoomRef.current.startAudio().catch(() => { });
                }
                const warmResult = await ensureWarmConnection();
                if (!warmResult.ok) {
                    await resetToHardwareCheck();
                    setBlockedAccessMessage(warmResult.message);
                    return;
                }
                const durationSeconds = sessionDurationRef.current;
                if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
                    throw new Error("Interview duration is not configured for this drive.");
                }
                if (!interviewEndsAt) {
                    setInterviewEndsAt(Date.now() + durationSeconds * 1000);
                    setRemainingSeconds(durationSeconds);
                    setTimerExpired(false);
                }
                setShouldConnect(true);
            } catch (err) {
                console.error("Phase transition failed:", err);
                setJoinError(err instanceof Error ? err.message : "Unable to start interview.");
                // Reset connection so a fresh dispatch is created on retry
                connectionAttemptRef.current += 1;
                void resetToHardwareCheck(err instanceof Error ? err.message : "Unable to start interview.");
            } finally {
                setIsJoining(false);
            }
        })();
    };
    useEffect(() => {
        if (phase !== "interview" || !isTabSwitchEnabled) {
            setIsTabViolation(false);
            clearDelayedViolation(tabViolationTimerRef);
            tabSwitchInFlightRef.current = false;
            return;
        }

        // Log a tab-switch violation. visibilitychange is the authoritative source;
        // blur is a fallback for browsers/VMs that don't fire visibilitychange reliably.
        // tabSwitchInFlightRef prevents the same physical event from logging twice.
        const logTabSwitchViolation = (reason: string, severity: "medium" | "high") => {
            if (tabViolationTimerRef.current !== null) return;
            // Capture elapsed time at the moment the event fires, before the grace delay.
            const detectedAt = Date.now();
            const elapsedMs = interviewStartedAtRef.current ? detectedAt - interviewStartedAtRef.current : null;
            // 1500ms grace window: OS notifications (Slack, email) typically steal focus
            // for <500ms and self-resolve. Only fire after sustained focus loss.
            tabViolationTimerRef.current = window.setTimeout(() => {
                tabViolationTimerRef.current = null;
                tabSwitchInFlightRef.current = false;
                const elapsedSeconds = elapsedMs !== null ? Math.floor(elapsedMs / 1000) : null;
                const elapsedLabel = elapsedSeconds !== null
                    ? `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s into interview`
                    : null;
                setTabViolationElapsed(elapsedLabel);
                setTabSwitchCount(prev => {
                    const newCount = prev + 1;
                    if (SHOW_TAB_FULLSCREEN_ALERTS) {
                        setIsTabViolation(true);
                    }
                    return newCount;
                });
                fetch("/api/interview/proctoring", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        applicationId: id,
                        interviewToken: interviewToken,
                        events: [{
                            eventType: "tab_switch",
                            severity,
                            timestamp: detectedAt,
                            reason: elapsedLabel ? `${reason} (${elapsedLabel})` : reason,
                            metadata: {
                                elapsedSeconds: elapsedSeconds ?? null,
                                elapsedLabel: elapsedLabel ?? null,
                            },
                        }]
                    })
                }).catch(() => { });
            }, 1500);
        };

        const onVisibilityChange = () => {
            if (document.hidden) {
                tabSwitchInFlightRef.current = true;
                logTabSwitchViolation("Tab Switched", "medium");
            } else {
                tabSwitchInFlightRef.current = false;
                clearDelayedViolation(tabViolationTimerRef);
            }
        };

        const onWindowBlur = () => {
            // Skip if visibilitychange already handled this event
            if (tabSwitchInFlightRef.current) return;
            tabSwitchInFlightRef.current = true;
            logTabSwitchViolation("Window Lost Focus", "medium");
        };

        const onWindowFocus = () => {
            tabSwitchInFlightRef.current = false;
            clearDelayedViolation(tabViolationTimerRef);
        };

        const onFullscreenChange = () => {
            const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement || (document as any).msFullscreenElement);
            if (!isFS) {
                setIsFullscreenViolation(true);
                // Fullscreen exit is deliberate — no grace window, high severity, logged separately
                const fsDetectedAt = Date.now();
                const fsElapsedMs = interviewStartedAtRef.current ? fsDetectedAt - interviewStartedAtRef.current : null;
                const fsElapsedSec = fsElapsedMs !== null ? Math.floor(fsElapsedMs / 1000) : null;
                const fsElapsedLabel = fsElapsedSec !== null
                    ? `${Math.floor(fsElapsedSec / 60)}m ${fsElapsedSec % 60}s into interview`
                    : undefined;
                fetch("/api/interview/proctoring", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        applicationId: id,
                        interviewToken: interviewToken,
                        events: [{
                            eventType: "tab_switch",
                            severity: "high",
                            timestamp: fsDetectedAt,
                            reason: fsElapsedLabel ? `Fullscreen Exited (${fsElapsedLabel})` : "Fullscreen Exited",
                            metadata: {
                                elapsedSeconds: fsElapsedSec ?? null,
                                elapsedLabel: fsElapsedLabel ?? null,
                            },
                        }]
                    })
                }).catch(() => { });
                if (SHOW_TAB_FULLSCREEN_ALERTS) {
                    setTabViolationElapsed(fsElapsedLabel ?? null);
                    setIsTabViolation(true);
                }
            } else {
                setIsFullscreenViolation(false);
                clearDelayedViolation(tabViolationTimerRef);
            }
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("blur", onWindowBlur);
        window.addEventListener("focus", onWindowFocus);
        document.addEventListener("fullscreenchange", onFullscreenChange);
        document.addEventListener("webkitfullscreenchange", onFullscreenChange);
        document.addEventListener("mozfullscreenchange", onFullscreenChange);
        document.addEventListener("MSFullscreenChange", onFullscreenChange);
        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("blur", onWindowBlur);
            window.removeEventListener("focus", onWindowFocus);
            document.removeEventListener("fullscreenchange", onFullscreenChange);
            document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
            document.removeEventListener("mozfullscreenchange", onFullscreenChange);
            document.removeEventListener("MSFullscreenChange", onFullscreenChange);
            clearDelayedViolation(tabViolationTimerRef);
            tabSwitchInFlightRef.current = false;
        };
    }, [phase, id, clearDelayedViolation, isTabSwitchEnabled]);
    useEffect(() => {
        if (phase !== "completed" && phase !== "finalizing") return;
        void exitFullscreenMode();
    }, [phase, exitFullscreenMode]);
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
        stopInterviewMedia();
        setShouldConnect(false);
    }, [phase, stopInterviewMedia]);
    return (
        <div ref={containerRef} className="min-h-screen bg-white text-gray-900 flex flex-col font-sans relative overflow-hidden" style={{ transform: 'translateZ(0)' }}>
            <AnimatePresence>
                {blockedAccessMessage && (
                    <motion.div
                        key="blocked-access"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[240] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.98 }}
                            className="w-full max-w-md rounded-[28px] bg-white shadow-2xl border border-black/5 p-8 text-center"
                        >
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                                <ShieldAlert className="h-8 w-8" />
                            </div>
                            <h2 className="text-2xl font-black tracking-tight text-gray-900">
                                You have already completed your interview
                            </h2>
                            <p className="mt-3 text-sm leading-6 text-gray-600">
                                {blockedAccessMessage}
                            </p>
                            <p className="mt-3 text-sm font-semibold text-gray-700">
                                Please contact the support team:{" "}
                                <a href="mailto:support@sreevaai.com" className="text-orange-600 underline decoration-orange-300 underline-offset-2">
                                    support@sreevaai.com
                                </a>
                            </p>
                            <div className="mt-6 flex justify-center gap-3">
                                <Button
                                    onClick={() => setBlockedAccessMessage(null)}
                                    className="rounded-full bg-orange-500 px-6 py-2.5 text-white font-bold hover:bg-orange-600"
                                >
                                    Got it
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence mode="wait">
                {phase === "loading" && (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 flex items-center justify-center bg-white absolute inset-0 z-50"
                    >
                        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                    </motion.div>
                )}

                {phase === "check" && (
                    <motion.div
                        key="check"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 1.1, filter: "blur(20px)" }}
                        transition={{ duration: 0.8 }}
                        className="flex-1 w-full bg-white z-50 absolute inset-0 overflow-y-auto"
                    >
                        <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-4">
                            <div className="space-y-6">
                                <div className="flex flex-col gap-2">
                                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">System Check</h2>
                                    <div className="flex flex-wrap gap-4">
                                        {[
                                            "Proctored Session",
                                            "Quiet Environment",
                                            "Support Available"
                                        ].map((text, i) => (
                                            <div key={text} className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{text}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="h-px w-full bg-gray-100" />
                            </div>
                        </div>
                        <HardwareCheck
                            onComplete={handleHardwareComplete}
                            onRetry={() => {
                                setJoinError(null);
                                void handleHardwareComplete();
                            }}
                            isStarting={isJoining}
                            errorMessage={joinError}
                            applicationId={id}
                            interviewToken={interviewToken}
                            title={`${interviewRoleLabel} Interview Check`}
                            bookedSlot={bookedSlot}
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
                            {launchRecoveryMessage && (
                                <motion.div
                                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 backdrop-blur-sm"
                                >
                                    <div className="w-[min(92vw,520px)] rounded-[2rem] bg-white p-8 shadow-2xl border border-black/5 text-center">
                                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-500 mb-3">Hold on</p>
                                        <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                                            {launchRecoveryMessage}
                                        </h3>
                                        <p className="mt-4 text-sm font-medium text-gray-500">
                                            {returnCountdown !== null ? `We'll return you to the hardware check screen in ${returnCountdown}s...` : "We'll return you to the hardware check screen in a moment."}
                                        </p>
                                    </div>
                                </motion.div>
                            )}
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
                        className="flex-1 w-full bg-white z-[100] absolute inset-0 overflow-y-auto"
                    >
                        <div className="min-h-full w-full flex items-center justify-center py-8 sm:py-16 px-4">
                            {endMode === "timeout" ? (
                                <TimeoutThankYouView candidateName={candidateDisplayName} />
                            ) : (
                                <CompletionView id={id} interviewToken={interviewToken} />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {phase === "interview" && (
                <>
                    <FaceProctoring
                        isActive={phase === "interview"}
                        referenceSnapshotUrl={referenceSnapshotUrl}
                        interviewStartedAt={interviewStartedAtRef}
                        onViolation={handleFaceViolation}
                    />
                    {(isCameraDisabledEnabled || isMicrophoneDisabledEnabled) && (
                        <HardwareHeartbeat
                            isActive={phase === "interview"}
                            interviewStartedAt={interviewStartedAtRef}
                            onViolation={handleHardwareViolation}
                        />
                    )}
                </>
            )}
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
                        options={{
                            dynacast: true,
                            videoCaptureDefaults: { resolution: { width: 1280, height: 720, frameRate: 30 } },
                        }}
                        video={shouldConnect ? (selectedCameraId ? { deviceId: selectedCameraId } : true) : false}
                        audio={shouldConnect ? (selectedMicId ? { deviceId: selectedMicId } : true) : false}
                        token={token}
                        serverUrl={serverUrl}
                        connect={shouldConnect}
                        data-lk-theme="default"
                        className="flex-1 flex flex-col w-full h-full"
                    >
                        <RoomAudioRenderer />
                        <InterviewRoomContent
                            id={id}
                            interviewToken={interviewToken}
                            onAgentReady={handleAgentReady}
                            onFinish={(reason = "normal") => {
                                setShouldConnect(false);
                                setEndMode(reason);
                                setPhase("completed");
                                void exitFullscreenMode();
                            }}
                            onFinalizing={() => setPhase("finalizing")}
                            isInterviewActive={phase === "interview"}
                            isLaunchingActive={phase === "launching"}
                            selectedMicId={selectedMicId}
                            timeLabel={formatDuration(remainingSeconds)}
                            timerExpired={timerExpired}
                            interviewRoleLabel={interviewRoleLabel}
                            onRemoteAgentAudioTrack={handleRemoteAgentAudioTrack}
                            onRoomReady={(room) => { lkRoomRef.current = room; }}
                            candidateName={candidateDisplayName}
                            onAgentDetectedViolation={handleAgentDetectedViolation}
                            setSupportDialogOpen={setSupportDialogOpen}
                            setInstructionsDialogOpen={setInstructionsDialogOpen}
                        />
                        {/*  Connection Proctoring (lives inside LiveKitRoom for useRoomContext) */}
                        {isConnectionLostEnabled && (
                            <ConnectionProctoring
                                isActive={phase === "interview"}
                                interviewStartedAt={interviewStartedAtRef}
                                onViolation={handleConnectionViolation}
                            />
                        )}
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
                {SHOW_TAB_FULLSCREEN_ALERTS && isTabViolation && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center p-6"
                    >
                        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
                            <div className={`mx-auto w-20 h-20 rounded-2xl flex items-center justify-center ${tabSwitchCount >= 3 ? "bg-red-500/10" : "bg-orange-500/10"}`}>
                                <ShieldAlert className={`w-10 h-10 ${tabSwitchCount >= 3 ? "text-red-500" : "text-orange-500"}`} />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                                    {isFullscreenViolation ? "Fullscreen Exited" : "Focus Lost"}
                                </h2>
                                <p className="text-zinc-400 text-sm font-medium leading-relaxed">
                                    {isFullscreenViolation
                                        ? "You exited fullscreen mode. Please stay in fullscreen during the interview."
                                        : tabSwitchCount === 1
                                            ? "You switched away from this tab. This incident has been logged for review."
                                            : `You have switched away ${tabSwitchCount} times. Repeated incidents are flagged for recruiter review.`}
                                </p>
                            </div>
                            <div className="pt-4 flex flex-col gap-3">
                                <Button
                                    onClick={() => setIsTabViolation(false)}
                                    className={`w-full text-white font-black uppercase tracking-widest py-6 rounded-2xl transition-all active:scale-95 ${tabSwitchCount >= 3
                                        ? "bg-red-500 hover:bg-red-600 shadow-[0_10px_20px_-10px_rgba(239,68,68,0.5)]"
                                        : "bg-orange-500 hover:bg-orange-600 shadow-[0_10px_20px_-10px_rgba(249,115,22,0.5)]"}`}
                                >
                                    I Understand & Continue
                                </Button>
                                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                    Incident {tabSwitchCount > 1 ? `${tabSwitchCount} of session` : "logged"} · Under review
                                </div>
                                {tabViolationElapsed && (
                                    <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest">
                                        Detected at {tabViolationElapsed}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/*  AI Proctoring Violation Alert (face / pose)  */}
            <AnimatePresence>
                {SHOW_BACKGROUND_PROCTORING_ALERTS && faceViolationAlert && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0, y: -40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -40 }}
                        className="fixed top-32 left-1/2 -translate-x-1/2 z-[220] pointer-events-none"
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
            {/*  Hardware Violation Alert (camera / mic disabled)  */}
            <AnimatePresence>
                {SHOW_BACKGROUND_PROCTORING_ALERTS && hardwareViolationAlert && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0, y: -40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -40 }}
                        className="fixed top-56 left-1/2 -translate-x-1/2 z-[220] pointer-events-none"
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
                {SHOW_BACKGROUND_PROCTORING_ALERTS && connectionAlert && phase === "interview" && (
                    <motion.div
                        initial={{ opacity: 0, y: -40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -40 }}
                        className="fixed top-64 left-1/2 -translate-x-1/2 z-[220] pointer-events-none"
                    >
                        <div className="flex items-center gap-3 bg-zinc-900/90 backdrop-blur-md rounded-2xl px-5 py-3 shadow-2xl max-w-sm border border-blue-500/30">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/10">
                                <WifiOff className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                                    Connection Issue
                                </p>
                                <p className="text-[11px] font-bold text-zinc-300 leading-tight mt-0.5">
                                    {connectionAlert.reason}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <Dialog open={instructionsDialogOpen} onOpenChange={setInstructionsDialogOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-orange-500 text-white flex items-center justify-center">
                                <ShieldAlert className="h-4 w-4" />
                            </div>
                            <DialogTitle className="text-xl font-black tracking-tight uppercase tracking-widest">Interview Guidelines</DialogTitle>
                        </div>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="space-y-4">
                            {[
                                { title: "Proctored Session", text: "This interview is proctored, so please do not try to cheat." },
                                { title: "Quiet Environment", text: "Sit in a quiet environment with no interruptions." },
                                { title: "Reporting Issues", text: "If you face any issue, use the Contact button right away." }
                            ].map((item, i) => (
                                <div key={i} className="flex gap-4 p-5 rounded-3xl bg-gray-50 border border-gray-100 transition-all hover:bg-orange-50/30 hover:border-orange-100 group">
                                    <div className="w-10 h-10 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-orange-500 font-black text-sm shadow-sm group-hover:border-orange-200">
                                        {i + 1}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">{item.title}</p>
                                        <p className="text-sm font-medium text-gray-500 leading-relaxed">{item.text}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 text-center px-4 uppercase tracking-widest">
                            Technical issues can be reported via the Support button.
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
            {/* Support Dialog */}
            <Dialog open={supportDialogOpen} onOpenChange={setSupportDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black tracking-tight uppercase tracking-widest">Contact Support</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {supportSuccess ? (
                            <div className="py-8 text-center space-y-4">
                                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-xl font-black text-gray-900">Thank You</h3>
                                    <p className="text-sm text-gray-500 font-medium">Your support request has been sent successfully. Our team will get back to you if needed.</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-black uppercase tracking-widest text-gray-400">Name</Label>
                                    <Input
                                        value={supportForm.name}
                                        onChange={(e) => setSupportForm((prev) => ({ ...prev, name: e.target.value }))}
                                        placeholder="Your full name"
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-black uppercase tracking-widest text-gray-400">Email</Label>
                                    <Input
                                        type="email"
                                        value={supportForm.email}
                                        onChange={(e) => setSupportForm((prev) => ({ ...prev, email: e.target.value }))}
                                        placeholder="you@example.com"
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-black uppercase tracking-widest text-gray-400">What is the issue about?</Label>
                                    <textarea
                                        value={supportForm.issueAbout}
                                        onChange={(e) => setSupportForm((prev) => ({ ...prev, issueAbout: e.target.value }))}
                                        placeholder="Describe the issue you are facing..."
                                        rows={4}
                                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-orange-400 focus:ring-4 focus:ring-orange-50"
                                    />
                                </div>
                                {supportError && (
                                    <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                                        {supportError}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    {!supportSuccess && (
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-xl"
                                onClick={() => setSupportDialogOpen(false)}
                                disabled={supportSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={submitSupportRequest}
                                disabled={supportSubmitting}
                                className="rounded-xl bg-[#F97316] text-white hover:bg-orange-600"
                            >
                                {supportSubmitting ? "Sending..." : "Send Request"}
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
function InterviewRoomContent({
    id,
    interviewToken,
    onFinish,
    onFinalizing,
    isInterviewActive,
    isLaunchingActive,
    selectedMicId,
    timeLabel,
    timerExpired,
    interviewRoleLabel,
    onRemoteAgentAudioTrack,
    onAgentReady,
    onRoomReady,
    candidateName,
    onAgentDetectedViolation,
    setSupportDialogOpen,
    setInstructionsDialogOpen,
}: {
    id: string,
    interviewToken: string,
    onFinish: (reason?: "normal" | "timeout") => void,
    onFinalizing: () => void,
    isInterviewActive: boolean,
    isLaunchingActive: boolean,
    selectedMicId?: string,
    timeLabel: string,
    timerExpired: boolean,
    interviewRoleLabel: string,
    onRemoteAgentAudioTrack: (track: MediaStreamTrack | null) => void,
    onAgentReady?: (isReady: boolean) => void,
    onRoomReady?: (room: Room) => void,
    candidateName?: string;
    /**
     * Candidate name shown in the interview room.
     */
    onAgentDetectedViolation?: (eventType: string, reason: string, severity?: string) => void;
    setSupportDialogOpen: (open: boolean) => void;
    setInstructionsDialogOpen: (open: boolean) => void;
}) {
    const { localParticipant } = useLocalParticipant();
    const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const connectionState = useConnectionState();
    const lkRoom = useRoomContext();
    const voiceAssistant = useVoiceAssistant();
    const autoFinishTriggeredRef = useRef(false);
    const interviewCompletionHandledRef = useRef(false);
    const [remoteForceFinish, setRemoteForceFinish] = useState(false);
    const [remoteForceFinishReason, setRemoteForceFinishReason] = useState<"normal" | "timeout">("normal");
    const localCameraTrack = cameraTracks.find((t) => t.participant.isLocal && t.source === Track.Source.Camera) || null;
    const localIdentity = lkRoom?.localParticipant?.identity ?? "";
    const transcriptions = useTranscriptions({ room: lkRoom });
    // Voice assistant state from LiveKit agent lifecycle.
    const aiParticipantTrack = voiceAssistant.audioTrack;
    const agentAudioTrack = getMediaStreamTrack(aiParticipantTrack ?? null);
    const hasAgentPresence = Boolean(voiceAssistant.agent);
    const assistantState = String(voiceAssistant.state);
    const isAiSpeaking = assistantState === "speaking";
    const isAiThinking = assistantState === "thinking" || assistantState === "initializing";
    const isAiListening = assistantState === "listening";
    // Give parent a ref to the room so it can call startAudio() on user gesture
    useEffect(() => {
        if (lkRoom) onRoomReady?.(lkRoom);
    }, [lkRoom, onRoomReady]);
    useEffect(() => {
        if (!isInterviewActive) {
            autoFinishTriggeredRef.current = false;
            interviewCompletionHandledRef.current = false;
            return;
        }
        if (hasAgentPresence) {
            autoFinishTriggeredRef.current = true;
        }
    }, [hasAgentPresence, isInterviewActive]);
    useEffect(() => {
        if (!lkRoom || !isInterviewActive) return;
        const handleRoomDisconnected = () => {
            if (interviewCompletionHandledRef.current) return;
            console.warn("[Interview] LiveKit room disconnected; waiting for explicit termination signal.");
        };
        lkRoom.on(RoomEvent.Disconnected, handleRoomDisconnected);
        return () => {
            lkRoom.off(RoomEvent.Disconnected, handleRoomDisconnected);
        };
    }, [lkRoom, isInterviewActive]);
    const sanitizeTranscriptText = useCallback((text: string) => {
        let result = text
            .replace(/<wait for response>/gi, "")
            // Strip bracketed internal directives like [DO NOT SAY ALOUD...] [STAGE 1...]
            .replace(/\[(?:[^\[\]]|\[[^\]]*\]){0,2000}\]/g, " ")
            // Strip known control phrase prefixes if they leak unbracketed
            .replace(/DO NOT SAY ALOUD/gi, " ")
            .replace(/INTERNAL INTERVIEWER INSTRUCTION/gi, " ")
            .replace(/NEXT_TURN_DIRECTIVE/gi, " ")
            .replace(/SHORT_RESPONSE_DIRECTIVE/gi, " ")
            .replace(/INTERVIEW STATE UPDATE/gi, " ")
            .replace(/SYSTEM ALERT/gi, " ")
            .replace(/BEGIN STAGE/gi, " ")
            .replace(/TRANSITION TO STAGE\s*\d*/gi, " ")
            .replace(/STAGE\s+\d+\s*[—\-–:]/gi, " ")
            .replace(/\s{2,}/g, " ")
            .trim();
        return result;
    }, []);
    // Media Control Logic
    const isMicEnabled = localParticipant?.isMicrophoneEnabled ?? false;
    const didAutoEnableMicRef = useRef(false);
    const toggleMic = useCallback(() => {
        localParticipant?.setMicrophoneEnabled(!isMicEnabled);
    }, [localParticipant, isMicEnabled]);
    useEffect(() => {
        if (!isInterviewActive || connectionState !== "connected" || !localParticipant) {
            didAutoEnableMicRef.current = false;
            return;
        }
        if (didAutoEnableMicRef.current || localParticipant.isMicrophoneEnabled) {
            didAutoEnableMicRef.current = true;
            return;
        }
        void localParticipant.setMicrophoneEnabled(true, selectedMicId ? { deviceId: selectedMicId } : undefined).then(() => {
            didAutoEnableMicRef.current = true;
        }).catch((err) => {
            console.warn("[Mic] Failed to auto-enable microphone:", err);
        });
    }, [connectionState, isInterviewActive, localParticipant, selectedMicId]);
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
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingStreamRef = useRef<MediaStream | null>(null);
    const recordingAudioContextRef = useRef<AudioContext | null>(null);
    const recordingSessionIdRef = useRef<string | null>(null);
    const recordingMimeTypeRef = useRef<string>("video/webm");
    const recordingStartedAtRef = useRef<number | null>(null);
    const recordingChunkIndexRef = useRef(0);
    const recordingChunkUrlsRef = useRef<string[]>([]);
    const recordingChunkKeysRef = useRef<string[]>([]);
    const recordingChunkUploadChainRef = useRef<Promise<void>>(Promise.resolve());
    const recordingFinalizePromiseRef = useRef<Promise<void> | null>(null);
    const recordingStopPromiseRef = useRef<Promise<void> | null>(null);
    const recordingStopResolveRef = useRef<(() => void) | null>(null);
    const recordingStopRejectRef = useRef<((reason?: unknown) => void) | null>(null);
    const recordingLastChunkEndedAtRef = useRef<number | null>(null);
    const recordingStartTimerRef = useRef<number | null>(null);
    const recordingAbandonedSentRef = useRef(false);
    const transcriptPanelRef = useRef<HTMLDivElement>(null);
    const buildFinalizeRecordingPayload = useCallback(() => {
        if (!recordingSessionIdRef.current) return null;
        const startedAt = recordingStartedAtRef.current ?? Date.now();
        const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        return {
            uploadType: "finalize_chunks",
            applicationId: id,
            interviewToken: interviewToken || "",
            sessionId: recordingSessionIdRef.current,
            chunkUrls: [...recordingChunkUrlsRef.current],
            chunkKeys: [...recordingChunkKeysRef.current],
            chunkCount: recordingChunkIndexRef.current,
            duration: durationSec,
            mimeType: recordingMimeTypeRef.current,
            startedAt: new Date(startedAt).toISOString(),
        };
    }, [id, interviewToken]);
    const sendRecordingFinalizePayload = useCallback((useBeacon: boolean) => {
        const payload = buildFinalizeRecordingPayload();
        if (!payload) return false;
        const body = JSON.stringify(payload);
        if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
            try {
                const beaconAccepted = navigator.sendBeacon(
                    "/api/interview/recording",
                    new Blob([body], { type: "application/json" })
                );
                if (beaconAccepted) {
                    return true;
                }
            } catch {
                // Fall through to fetch below.
            }
        }
        void fetch("/api/interview/recording", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: useBeacon,
        }).catch(() => { });
        return true;
    }, [buildFinalizeRecordingPayload, id, interviewToken]);
    const markRecordingAbandoned = useCallback((reason: string) => {
        if (
            recordingAbandonedSentRef.current ||
            !recordingSessionIdRef.current ||
            !recordingStartedRef.current ||
            recordingFinalizePromiseRef.current ||
            recordingStopPromiseRef.current
        ) {
            return;
        }
        recordingAbandonedSentRef.current = true;
        const payload = JSON.stringify({
            uploadType: "abandon",
            applicationId: id,
            interviewToken: interviewToken || "",
            sessionId: recordingSessionIdRef.current,
            reason,
        });
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
            try {
                const blob = new Blob([payload], { type: "application/json" });
                navigator.sendBeacon("/api/interview/recording", blob);
                return;
            } catch { }
        }
        fetch("/api/interview/recording", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
        }).catch(() => { });
    }, [buildFinalizeRecordingPayload]);
    const markRecordingFailed = useCallback(async (reason: string) => {
        if (!recordingSessionIdRef.current || !recordingStartedAtRef.current) return;
        const durationSec = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        await fetch("/api/interview/recording", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                uploadType: "mark_failed",
                applicationId: id,
                interviewToken: interviewToken || "",
                sessionId: recordingSessionIdRef.current,
                duration: durationSec,
                startedAt: new Date(recordingStartedAtRef.current).toISOString(),
                reason,
            }),
        }).catch(() => { });
    }, [id, interviewToken]);
    const uploadRecordingChunk = useCallback(async (blob: Blob, chunkIndex: number, chunkStartedAtMs: number, chunkEndedAtMs: number) => {
        if (!blob.size || !recordingSessionIdRef.current) return;
        console.debug(
            `[Recording] chunk ${chunkIndex} queued (${blob.size} bytes, ${new Date(chunkStartedAtMs).toISOString()} -> ${new Date(chunkEndedAtMs).toISOString()})`
        );
        const formData = new FormData();
        formData.append("uploadType", "chunk");
        formData.append("applicationId", id);
        formData.append("interviewToken", interviewToken || "");
        formData.append("sessionId", recordingSessionIdRef.current);
        formData.append("chunkIndex", String(chunkIndex));
        formData.append("mimeType", recordingMimeTypeRef.current);
        formData.append("startedAt", new Date(recordingStartedAtRef.current || Date.now()).toISOString());
        formData.append("chunkStartedAt", new Date(chunkStartedAtMs).toISOString());
        formData.append("chunkEndedAt", new Date(chunkEndedAtMs).toISOString());
        formData.append("byteSize", String(blob.size));
        formData.append("recording", new File([blob], `chunk-${chunkIndex}.webm`, { type: blob.type || "video/webm" }));
        // Retry up to 3 times with exponential backoff to guard against transient network errors.
        const MAX_CHUNK_RETRIES = 3;
        let lastError: unknown;
        for (let attempt = 1; attempt <= MAX_CHUNK_RETRIES; attempt++) {
            try {
                const res = await fetch("/api/interview/recording", {
                    method: "POST",
                    body: formData,
                });
                if (!res.ok) {
                    const errPayload = await res.json().catch(() => ({}));
                    throw new Error(errPayload?.error || `Chunk upload HTTP ${res.status}`);
                }
                const payload = await res.json().catch(() => ({}));
                if (payload?.chunkUrl) {
                    recordingChunkUrlsRef.current.push(String(payload.chunkUrl));
                }
                if (payload?.chunkKey) {
                    recordingChunkKeysRef.current.push(String(payload.chunkKey));
                }
                console.debug(
                    `[Recording] chunk ${chunkIndex} uploaded ${payload?.chunkKey ? `-> ${String(payload.chunkKey)}` : ""}`.trim()
                );
                return; // success
            } catch (err) {
                lastError = err;
                if (attempt < MAX_CHUNK_RETRIES) {
                    await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
                }
            }
        }
        throw lastError;
    }, [id, interviewToken]);
    const finalizeRecordingChunks = useCallback(async () => {
        if (recordingFinalizePromiseRef.current) {
            await recordingFinalizePromiseRef.current;
            return;
        }
        if (!recordingSessionIdRef.current) return;
        if (!recordingChunkUrlsRef.current.length) {
            console.warn("[Recording] No uploaded chunks found for finalization.");
            return;
        }
        const payload = buildFinalizeRecordingPayload();
        if (!payload) return;
        console.debug(
            `[Recording] finalizing ${payload.chunkUrls.length} chunk(s), ${payload.chunkCount} chunk event(s)`
        );
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 60_000);
        const promise = fetch("/api/interview/recording", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
        }).then(async (res) => {
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.error || "Chunk finalize failed");
            }
            console.debug(`[Recording] finalize request accepted for ${payload.sessionId}`);
        }).finally(() => {
            window.clearTimeout(timeout);
            recordingFinalizePromiseRef.current = null;
        });
        recordingFinalizePromiseRef.current = promise;
        await promise;
    }, [buildFinalizeRecordingPayload, id, interviewToken]);
    const cleanupRecordingResources = useCallback(() => {
        if (recordingAudioContextRef.current) {
            recordingAudioContextRef.current.close().catch(() => { });
            recordingAudioContextRef.current = null;
        }
        if (recordingStreamRef.current) {
            recordingStreamRef.current.getTracks().forEach((track) => track.stop());
            recordingStreamRef.current = null;
        }
        mediaRecorderRef.current = null;
        recordingSessionIdRef.current = null;
        recordingChunkIndexRef.current = 0;
        recordingChunkUrlsRef.current = [];
        recordingChunkKeysRef.current = [];
        recordingChunkUploadChainRef.current = Promise.resolve();
        recordingFinalizePromiseRef.current = null;
        recordingStopPromiseRef.current = null;
        recordingStopResolveRef.current = null;
        recordingStopRejectRef.current = null;
        recordingLastChunkEndedAtRef.current = null;
        if (recordingStartTimerRef.current !== null) {
            window.clearTimeout(recordingStartTimerRef.current);
            recordingStartTimerRef.current = null;
        }
        recordingStartedRef.current = false;
        recordingStartedAtRef.current = null;
    }, []);
    const startBrowserRecording = useCallback(async () => {
        if (recordingStartedRef.current) return;
        if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
            console.warn("[Recording] MediaRecorder not supported.");
            return;
        }
        const cameraTrack = getMediaStreamTrack(localCameraTrack ?? null);
        const micTrack = localParticipant?.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null;
        const remoteTrack = agentAudioTrack && agentAudioTrack.kind === "audio" ? agentAudioTrack : null;
        if (!cameraTrack) {
            console.warn("[Recording] Camera track not available; skipping start.");
            return;
        }
        if (cameraTrack.readyState !== "live" || cameraTrack.muted) {
            console.warn("[Recording] Camera track is not live yet; waiting.");
            return;
        }
        if (localParticipant && !localParticipant.isCameraEnabled) {
            console.warn("[Recording] Camera is disabled; waiting.");
            return;
        }
        if (!micTrack || !remoteTrack) {
            console.warn("[Recording] Waiting for both local and remote audio tracks.");
            return;
        }
        const audioContext = new AudioContext();
        await audioContext.resume().catch(() => { });
        const destination = audioContext.createMediaStreamDestination();
        // Clone tracks to isolate recording from live playback.
        // This prevents AEC from 'ducking' the volume of the live AI speaker.
        const micClone = micTrack.clone();
        const remoteClone = remoteTrack.clone();
        const micSource = audioContext.createMediaStreamSource(new MediaStream([micClone]));
        const remoteSource = audioContext.createMediaStreamSource(new MediaStream([remoteClone]));
        // --- Quality Improvement: Dynamics Compressor ---
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-20, audioContext.currentTime); // Relaxed threshold
        compressor.knee.setValueAtTime(40, audioContext.currentTime);
        compressor.ratio.setValueAtTime(8, audioContext.currentTime); // Lower ratio for less 'low' volume effect
        compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
        compressor.release.setValueAtTime(0.25, audioContext.currentTime);
        micSource.connect(compressor);
        remoteSource.connect(compressor);
        compressor.connect(destination);
        const mixedStream = new MediaStream();
        mixedStream.addTrack(cameraTrack.clone());
        destination.stream.getAudioTracks().forEach((track) => mixedStream.addTrack(track));
        const mimeType = getRecordingMimeType();
        const sessionId = crypto.randomUUID();
        recordingSessionIdRef.current = sessionId;
        recordingMimeTypeRef.current = mimeType;
        recordingStartedAtRef.current = Date.now();
        recordingLastChunkEndedAtRef.current = recordingStartedAtRef.current;
        recordingAbandonedSentRef.current = false;
        fetch("/api/interview/recording", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                uploadType: "started",
                applicationId: id,
                interviewToken: interviewToken || "",
                sessionId,
                startedAt: new Date(recordingStartedAtRef.current).toISOString(),
                mimeType,
            }),
        }).catch(() => { });
        const recorder = new MediaRecorder(mixedStream, {
            mimeType,
            videoBitsPerSecond: 1_200_000,
            audioBitsPerSecond: 128_000,
        });
        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordingChunkIndexRef.current += 1;
                const chunkIndex = recordingChunkIndexRef.current;
                const chunkStartedAt = recordingLastChunkEndedAtRef.current || recordingStartedAtRef.current || Date.now();
                const chunkEndedAt = Date.now();
                recordingLastChunkEndedAtRef.current = chunkEndedAt;
                recordingChunkUploadChainRef.current = recordingChunkUploadChainRef.current
                    .then(() => uploadRecordingChunk(event.data, chunkIndex, chunkStartedAt, chunkEndedAt))
                    .catch((err) => {
                        console.error(`[Recording] chunk ${chunkIndex} upload failed:`, err);
                    });
            }
        };
        recorder.onstop = async () => {
            try {
                await recordingChunkUploadChainRef.current;
            } catch { }
            recordingStopResolveRef.current?.();
            recordingStopResolveRef.current = null;
            recordingStopRejectRef.current = null;
            recordingStopPromiseRef.current = null;
        };
        recorder.onerror = (event) => {
            recordingStopRejectRef.current?.((event as unknown as { error?: unknown })?.error || new Error("MediaRecorder failed"));
            recordingStopResolveRef.current = null;
            recordingStopRejectRef.current = null;
            recordingStopPromiseRef.current = null;
        };
        recordingAudioContextRef.current = audioContext;
        recordingStreamRef.current = mixedStream;
        mediaRecorderRef.current = recorder;
        recordingStartedRef.current = true;
        // Use a tiny delay to ensure audio graph is stable before starting
        recordingStartTimerRef.current = window.setTimeout(() => {
            if (recorder.state === "inactive") {
                recorder.start(5000);
                console.log("[Recording] Browser recorder started with isolated tracks.");
            }
            recordingStartTimerRef.current = null;
        }, 500);
    }, [agentAudioTrack, localCameraTrack, localParticipant, uploadRecordingChunk]);
    const stopBrowserRecording = useCallback(async () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder) return;
        if (recorder.state !== "inactive" && !recordingStopPromiseRef.current) {
            recordingStopPromiseRef.current = new Promise<void>((resolve, reject) => {
                recordingStopResolveRef.current = resolve;
                recordingStopRejectRef.current = reject;
            });
            recorder.stop();
        }
        if (recordingStopPromiseRef.current) {
            try {
                // Wait for up to 5 seconds for uploads to finish.
                // If they take longer, we proceed anyway so the user isn't stuck.
                await Promise.race([
                    recordingStopPromiseRef.current,
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Stop timeout")), 5000))
                ]);
            } catch (err) {
                console.warn("[Recording] stop wait timed out or failed:", err);
            }
        }
        try {
            await recordingChunkUploadChainRef.current;
            if (!recordingChunkUrlsRef.current.length) {
                markRecordingAbandoned("no_chunks_uploaded");
            } else {
                await finalizeRecordingChunks();
            }
        } catch (err) {
            await markRecordingFailed((err as Error)?.message || "finalize_failed");
            throw err;
        } finally {
            cleanupRecordingResources();
        }
    }, [cleanupRecordingResources, finalizeRecordingChunks, markRecordingAbandoned, markRecordingFailed]);
    // Agent readiness is based on room connection plus an observable greeting signal.
    // IMPORTANT: onAgentReady is a one-way latch. Once we fire true we never send false
    // again - the parent commits the phase change and a subsequent false (when assistantState
    // moves from "speaking" -> "listening") would race and reset isAgentReady before
    // the transition effect runs, leaving the launch screen permanently stuck.
    useEffect(() => {
        if (!isLaunchingActive) {
            // Reset the latch when a new launch attempt starts
            launchReadySignalSentRef.current = false;
            return;
        }
        // Already fired - do nothing more
        if (launchReadySignalSentRef.current) return;
        const readyNow = connectionState === "connected"
            && hasAgentPresence
            && (
                assistantState === "speaking"
                // Agent present + audio track published + past initializing
                || (assistantState !== "initializing" && Boolean(agentAudioTrack))
                // Fallback: agent joined and is now listening (greeting already sent)
                || assistantState === "listening"
            );
        if (readyNow) {
            launchReadySignalSentRef.current = true;
            console.log("[Agent] Ready in launching phase - state:", assistantState);
            onAgentReady?.(true);
        }
    }, [isLaunchingActive, connectionState, hasAgentPresence, assistantState, agentAudioTrack, onAgentReady]);
    // Start recording as soon as interview is active AND the agent audio track is available.
    // Waiting for agentAudioTrack ensures the AI interviewer voice is mixed into the recording.
    useEffect(() => {
        if (!isInterviewActive || recordingStartedRef.current) return;
        if (!agentAudioTrack) return; // wait until agent audio is published
        const intervalId = window.setInterval(() => {
            if (recordingStartedRef.current) return;
            void startBrowserRecording();
        }, 700);
        void startBrowserRecording();
        return () => window.clearInterval(intervalId);
    }, [isInterviewActive, startBrowserRecording, agentAudioTrack]);
    const groupedTranscriptions = useMemo(() => {
        const groups: {
            id: string;
            identity: string;
            isCandidate: boolean;
            speakerName: string;
            segments: Array<{ text: string; isFinal: boolean; id: string; timestamp: number }>;
        }[] = [];
        // Track latest version of each segment ID (LiveKit may re-emit same ID with updated text)
        const latestSegments = new Map<string, { text: string; isFinal: boolean; id: string; timestamp: number; identity: string }>();
        for (const segment of transcriptions as TranscriptionSegment[]) {
            const cleanText = sanitizeTranscriptText(segment.text);
            if (!cleanText) continue;
            const identity = segment.participantInfo?.identity || "";
            const isFinal = segment.streamInfo.attributes?.["lk.transcription_final"] === "true";
            const id = segment.streamInfo.id;
            const timestamp = segment.streamInfo.timestamp;
            latestSegments.set(id, { text: cleanText, isFinal, id, timestamp, identity });
        }
        // Track the latest timestamp seen per group for time-gap calculation
        const groupLatestTimestamp = new Map<number, number>();
        const sortedSegments = Array.from(latestSegments.values()).sort((a, b) => a.timestamp - b.timestamp);
        for (const segment of sortedSegments) {
            const isCandidate = segment.identity === localIdentity;
            const lastGroupIdx = groups.length - 1;
            const lastGroup = groups[lastGroupIdx];
            let shouldBreak = false;
            if (lastGroup) {
                if (lastGroup.identity !== segment.identity) {
                    shouldBreak = true;
                } else {
                    const lastTs = groupLatestTimestamp.get(lastGroupIdx) ?? segment.timestamp;
                    if (segment.timestamp - lastTs > 3000) {
                        shouldBreak = true;
                    }
                }
            }
            if (lastGroup && !shouldBreak) {
                groupLatestTimestamp.set(lastGroupIdx, segment.timestamp);
                if (segment.isFinal) {
                    // Final segment: drop any existing non-finals and append
                    lastGroup.segments = lastGroup.segments.filter(s => s.isFinal);
                    lastGroup.segments.push(segment);
                } else {
                    // Non-final: replace any existing non-final with this latest chunk
                    lastGroup.segments = lastGroup.segments.filter(s => s.isFinal);
                    lastGroup.segments.push(segment);
                }
            } else {
                const newIdx = groups.length;
                groupLatestTimestamp.set(newIdx, segment.timestamp);
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
    }, [sanitizeTranscriptText, transcriptions, localIdentity]);
    const aiTranscriptGroups = useMemo(
        () => groupedTranscriptions.filter((group) => !group.isCandidate),
        [groupedTranscriptions]
    );
    const latestAiTranscript = useMemo(() => {
        if (aiTranscriptGroups.length === 0) return null;
        const latest = aiTranscriptGroups[aiTranscriptGroups.length - 1];
        const finalSegs = latest.segments.filter((s) => s.isFinal);
        const nonFinalSegs = latest.segments.filter((s) => !s.isFinal);
        const latestNonFinal = nonFinalSegs.length > 0 ? nonFinalSegs[nonFinalSegs.length - 1] : null;
        const displaySegs = latestNonFinal ? [...finalSegs, latestNonFinal] : finalSegs;
        const text = sanitizeTranscriptText(displaySegs.map((s) => s.text).join(" "));
        if (!text) return null;
        return {
            id: latest.id,
            isFinal: latest.segments.every((s) => s.isFinal),
            text,
        };
    }, [aiTranscriptGroups, sanitizeTranscriptText]);
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
                    setRemoteForceFinishReason(packet.reason === "inactivity_timeout" ? "timeout" : "normal");
                    setRemoteForceFinish(true);
                } else if (packet.type === "proctoring_violation") {
                    // Agent detected a proctoring event.
                    // Sync to candidate UI for immediate feedback
                    onAgentDetectedViolation?.(
                        packet.eventType || "proctoring_violation",
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
    useEffect(() => {
        if (!transcriptPanelRef.current) return;
        transcriptPanelRef.current.scrollTop = transcriptPanelRef.current.scrollHeight;
    }, [transcriptions]);
    const handleFinish = useCallback(async (reason: "normal" | "timeout" = "normal") => {
        if (finishStartedRef.current) return;
        finishStartedRef.current = true;
        // Exit fullscreen mode immediately when interview ends
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }
        // Keep the room alive while the final chunk upload / merge completes.
        // If we disconnect too early, the finalize request can get cut off and
        // the merged recording never reaches the DB.
        const stopTimeoutMs = 15000;
        const stopPromise = stopBrowserRecording().catch((err) => {
            console.warn("[Recording] background stop failed:", err);
        });
        onFinalizing();
        await Promise.race([
            stopPromise,
            new Promise<void>((resolve) => {
                window.setTimeout(resolve, stopTimeoutMs);
            }),
        ]);
        setTimeout(() => {
            try { lkRoom?.disconnect(); } catch (_) { }
            onFinish(reason);
        }, 1200);
    }, [lkRoom, onFinalizing, onFinish, stopBrowserRecording]);
    useEffect(() => {
        if (isInterviewActive) return;
        void stopBrowserRecording();
    }, [isInterviewActive, stopBrowserRecording]);
    useEffect(() => {
        const handlePageHide = () => {
            if (!isInterviewActive) return;
            if (!recordingStartedRef.current) return;
            if (recordingChunkUrlsRef.current.length > 0) {
                sendRecordingFinalizePayload(true);
            } else {
                markRecordingAbandoned("pagehide_before_finalize");
            }
        };
        window.addEventListener("pagehide", handlePageHide);
        return () => window.removeEventListener("pagehide", handlePageHide);
    }, [isInterviewActive, markRecordingAbandoned, sendRecordingFinalizePayload]);
    useEffect(() => {
        if (!timerExpired || !isInterviewActive) return;
        void handleFinish("normal");
    }, [timerExpired, isInterviewActive, handleFinish]);
    useEffect(() => {
        if (!remoteForceFinish || !isInterviewActive) return;
        void handleFinish(remoteForceFinishReason);
    }, [remoteForceFinish, remoteForceFinishReason, isInterviewActive, handleFinish]);
    return (
        <div className="flex-1 flex flex-col h-full w-full relative bg-[#121214] text-white overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,_rgba(249,115,22,0.04)_0%,_transparent_50%)] pointer-events-none" />
            {/* Role Context - TOP LEFT */}
            <div className="absolute top-10 left-10 z-[60]">
                <div className="flex items-center gap-4 bg-zinc-900/90 px-6 py-4 rounded-[2rem] border border-white/5 shadow-2xl">
                    <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center border border-orange-500/30">
                        <Sparkles className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">Live Interview</p>
                        <p className="text-sm font-black text-white tracking-tight italic">{interviewRoleLabel}</p>
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
            <div className="absolute top-40 right-10 z-50 flex flex-col gap-3 items-end">
                <div className="w-72 aspect-[4/3] bg-zinc-900 rounded-[2rem] p-1 shadow-[0_20px_60px_rgba(0,0,0,0.6)] group border border-white/10 ring-1 ring-white/5" style={{ transform: 'translateZ(0)' }}>
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
                {/* Session Actions - beside camera */}
                <div className="flex items-center gap-2 pr-4">
                    <button
                        onClick={() => setInstructionsDialogOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/90 border border-white/10 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all shadow-xl"
                    >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Guidelines
                    </button>
                    <button
                        onClick={() => setSupportDialogOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/90 border border-white/10 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all shadow-xl"
                    >
                        <LifeBuoy className="w-3.5 h-3.5" />
                        Contact
                    </button>
                </div>
            </div>
            {/* AI Avatar Area */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 pt-20 pb-10 relative">
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
                {latestAiTranscript && (
                    <div className="w-full max-w-[68rem] mt-16 md:mt-24 px-2 relative z-20">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={latestAiTranscript.id}
                                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -12, scale: 0.98 }}
                                transition={{ duration: 0.28, ease: "easeOut" }}
                                className="w-full rounded-[1.75rem] border border-white/10 bg-[#2c2c2e]/95 px-12 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
                            >
                                <div className="flex items-start gap-5 w-full">
                                    <span className="text-[10px] font-black uppercase tracking-[0.35em] shrink-0 pt-1 text-white/90">
                                        Ishitha
                                    </span>
                                    <p className={cn(
                                        "text-[16px] md:text-[18px] font-medium text-white leading-[1.8] tracking-tight whitespace-normal break-words w-full",
                                        !latestAiTranscript.isFinal && "text-white/75"
                                    )}>
                                        {latestAiTranscript.text}
                                        {!latestAiTranscript.isFinal && <span className="inline-block ml-1 opacity-50">...</span>}
                                    </p>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                )}
                {false && (
                    <div className="absolute right-[calc(50%+180px)] bottom-[20%] z-[65] w-[380px] pointer-events-none">
                        <div
                            className="flex flex-col-reverse justify-start gap-6 max-h-[60vh] overflow-hidden px-6 py-12"
                            style={{
                                maskImage: 'linear-gradient(to top, transparent 0%, transparent 5%, black 20%, black 70%, transparent 95%, transparent 100%)',
                                WebkitMaskImage: 'linear-gradient(to top, transparent 0%, transparent 5%, black 20%, black 70%, transparent 95%, transparent 100%)'
                            }}
                        >
                            <AnimatePresence mode="popLayout">
                                {aiTranscriptGroups.slice(-5).reverse().map((group, idx) => {
                                    const isGroupFinal = group.segments.every(s => s.isFinal);
                                    // Only combine final segments + the single latest non-final chunk.
                                    // This prevents partial words ("bu", "thr") from stacking visibly.
                                    const finalSegs = group.segments.filter(s => s.isFinal);
                                    const nonFinalSegs = group.segments.filter(s => !s.isFinal);
                                    const latestNonFinal = nonFinalSegs.length > 0 ? nonFinalSegs[nonFinalSegs.length - 1] : null;
                                    const displaySegs = latestNonFinal ? [...finalSegs, latestNonFinal] : finalSegs;
                                    const combinedText = displaySegs.map(s => s.text.trim()).filter(Boolean).join(" ");
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
                                                            <span className="text-[10px] text-zinc-600 animate-pulse">• • •</span>
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
                )}
            </div>
            {/* Bottom Navigation & Premium Timer */}
            <div className="min-h-[11rem] bg-zinc-900/80 p-8 grid grid-cols-3 items-center relative z-10">
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
                {/* Middle: Transcript + End Interview Button */}
                <div className="flex flex-col items-center gap-3">
                    <Button
                        variant="destructive"
                        onClick={() => handleFinish("normal")}
                        className="h-20 px-16 rounded-[2.5rem] bg-red-600 text-white hover:bg-black hover:text-white font-black uppercase tracking-[0.3em] text-[12px] transition-all shadow-[0_20px_50px_rgba(220,38,38,0.3)] active:scale-95 border-none group"
                    >
                        <span className="flex items-center gap-3">
                            Finish Interview
                            <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </span>
                    </Button>
                </div>
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
            muted
            className="w-full h-full object-cover bg-zinc-950"
        />
    );
}

function TimeoutThankYouView({ candidateName }: { candidateName: string }) {
    return (
        <div className="w-full max-w-xl mx-auto px-6 text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-orange-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-[0_20px_40px_rgba(249,115,22,0.3)] rotate-3">
                <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-5xl font-black text-gray-900 uppercase italic tracking-tighter mb-6">Thank You</h2>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em] leading-relaxed mb-4 max-w-sm mx-auto">
                The interview session has ended.
            </p>
            <p className="text-sm font-medium text-gray-400 leading-relaxed max-w-md mx-auto">
                Thank you for your time, {candidateName}. You can close this screen now.
            </p>
        </div>
    );
}
function CompletionView({ id, interviewToken }: { id: string; interviewToken: string }) {
    return (
        <CandidateRatingForm
            title="Candidate Rating"
            subtitle="Share how the interview felt so we can improve the AI."
            onSubmit={async (payload) => {
                await fetch(`/api/interview/${id}/feedback`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        rating: {
                            overallFeeling: payload.overallFeeling,
                            aiQuestions: payload.aiQuestions,
                            understanding: payload.understanding,
                        },
                        feedback: payload.notes,
                        interviewToken,
                    }),
                });
            }}
        />
    );
}
