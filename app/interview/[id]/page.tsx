"use client";
import { Suspense, useState, use, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Mic2, ShieldCheck, ShieldAlert, Zap, ChevronLeft, ChevronRight, Send, Loader2, Video, VideoOff, MicOff, PhoneOff, CheckCircle2, ArrowRight, Camera, Mic, AlertCircle, LogOut, Eye, EyeOff, Users, Volume2, WifiOff, User, ChevronDown, MessageSquare, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
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

// Global media stream tracker to ensure hardware is fully released when finishing the interview
if (typeof window !== "undefined") {
    if (!(window as any).__trackTrackerInjected && navigator.mediaDevices) {
        (window as any).__trackTrackerInjected = true;
        (window as any).__activeTracks = new Set<MediaStreamTrack>();
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
            const stream = await originalGetUserMedia(constraints);
            stream.getTracks().forEach(t => {
                (window as any).__activeTracks.add(t);
                t.addEventListener('ended', () => {
                    (window as any).__activeTracks.delete(t);
                });
            });
            return stream;
        };
    }
}

function stopAllHardwareTracksGlobally() {
    if (typeof window !== "undefined" && (window as any).__activeTracks) {
        const tracks: Set<MediaStreamTrack> = (window as any).__activeTracks;
        tracks.forEach(track => {
            try {
                track.stop();
            } catch { }
        });
        tracks.clear();
    }
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
const FATAL_ERROR_MESSAGE = "We're sorry, something went wrong from our side. Please contact our support team at support@sreevaai.com.";

function InterviewContent({ id, params }: { id: string, params: Promise<{ id: string }> }) {
    const [phase, setPhase] = useState<"loading" | "check" | "launching" | "interview" | "finalizing" | "completed">("loading");
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
    const interviewStartSyncQueuedRef = useRef(false);
    const launchStartedAtRef = useRef<number | null>(null);
    const lkRoomRef = useRef<Room | null>(null);
    const connectionAttemptRef = useRef(0);
    const launchRecoveryTimerRef = useRef<number | null>(null);
    const wasFullscreenRef = useRef(false);
    const fullscreenStableRef = useRef(false);
    const [isAgentReady, setIsAgentReady] = useState(false);
    const [agentReadyLatencyMs, setAgentReadyLatencyMs] = useState<number | null>(null);
    const [launchTimeoutCheck, setLaunchTimeoutCheck] = useState(0);
    const [launchRecoveryMessage, setLaunchRecoveryMessage] = useState<string | null>(null);
    const [returnCountdown, setReturnCountdown] = useState<number | null>(null);
    // One violation state per signal -- tab_switch, fullscreen_exit, window_focus_loss
    // are independent signals with independent toggles, counts, and toasts.
    type FocusSignalKind = "tab_switch" | "fullscreen_exit" | "window_focus_loss";
    const [activeFocusViolation, setActiveFocusViolation] = useState<FocusSignalKind | null>(null);
    const [focusSignalCounts, setFocusSignalCounts] = useState<Record<FocusSignalKind, number>>({
        tab_switch: 0,
        fullscreen_exit: 0,
        window_focus_loss: 0,
    });
    const [focusViolationElapsed, setFocusViolationElapsed] = useState<string | null>(null);
    const tabViolationTimerRef = useRef<number | null>(null);
    // Guards against the same physical action firing more than one signal type -- 
    // e.g. exiting fullscreen via Esc also blurs the window and can hide the tab
    // in some browsers. Whichever listener claims the transition first wins;
    // the others skip. Cleared as soon as focus/visibility/fullscreen is restored.
    const focusEventInFlightRef = useRef(false);
    const fingerprintIntervalRef = useRef<number | null>(null);
    // Timestamp (ms) when interview phase started -- used to compute elapsed time in proctoring events
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
    const [blockedAccessTitle, setBlockedAccessTitle] = useState<string>("Access Restricted");
    const showFatalError = useCallback(() => {
        setBlockedAccessTitle("Technical Issue");
        setBlockedAccessMessage(FATAL_ERROR_MESSAGE);
        setIsInitiallyLocked(true);
    }, []);
    const [supportForm, setSupportForm] = useState({
        name: "",
        email: "",
        issueAbout: "",
    });
    const SHOW_BACKGROUND_PROCTORING_ALERTS = false;
    const SHOW_TAB_FULLSCREEN_ALERTS = true;
    const searchParams = useSearchParams();
    const interviewToken = searchParams.get("token") || "";
    const organizationName = searchParams.get("orgName")?.trim() || "";
    const requireInterviewToken = isInterviewTokenRequired();
    const isTabSwitchEnabled = Boolean(proctoringSignals.tab_switch);
    const isFullscreenExitEnabled = Boolean(proctoringSignals.fullscreen_exit);
    const isWindowFocusLossEnabled = Boolean(proctoringSignals.window_focus_loss);
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
    const collectFingerprint = useCallback(() => {
        const c = document.createElement("canvas");
        c.width = 256; c.height = 256;
        const ctx = c.getContext("2d");
        let canvasHash = "";
        if (ctx) {
            ctx.fillStyle = "rgb(255,255,255)";
            ctx.fillRect(0, 0, 256, 256);
            ctx.fillStyle = "rgb(0,0,0)";
            ctx.font = "14px Arial";
            ctx.fillText("SreevaAI", 10, 50);
            ctx.fillText(navigator.userAgent, 10, 80);
            canvasHash = c.toDataURL().slice(-32);
        }
        return {
            screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language,
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            hardwareConcurrency: navigator.hardwareConcurrency ?? null,
            deviceMemory: (navigator as unknown as Record<string, unknown>).deviceMemory ?? null,
            canvasHash,
            sessionId: (() => { try { return sessionStorage.getItem("fp_session_id") || ""; } catch { return ""; } })(),
            collectedAt: Date.now(),
        };
    }, []);
    // Load reference snapshot from sessionStorage (set by HardwareCheck after camera capture)
    useEffect(() => {
        try {
            const snap = sessionStorage.getItem("proctor_ref_snapshot");
            if (snap) setReferenceSnapshotUrl(snap);
        } catch { }
        try {
            if (!sessionStorage.getItem("fp_session_id")) {
                sessionStorage.setItem("fp_session_id", crypto.randomUUID());
            }
        } catch { }
    }, []);
    const [isInitiallyLocked, setIsInitiallyLocked] = useState(false);
    // scheduledAt from API -- used for the slot countdown gate
    const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
    // Seconds until button unlocks (exactly at slot time -- matches server gate)
    const [slotCountdownSecs, setSlotCountdownSecs] = useState<number | null>(null);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const url = new URL(`/api/interview/${id}/token`, window.location.href);
                if (interviewToken) url.searchParams.set("token", interviewToken);
                const res = await fetch(url.toString(), { cache: "no-store" });
                const data = await res.json();
                if (!active) return;
                if (!res.ok && data.error) {
                    if (data.code === "TOO_EARLY" && data.scheduledAt) {
                        // Not open yet -- no waiting room before slot time. Show hardware check
                        // (gated) so the candidate can prep, but Begin stays locked until slot.
                        const slot = new Date(data.scheduledAt);
                        setScheduledAt(slot);
                        setSlotCountdownSecs(Math.ceil((slot.getTime() - Date.now()) / 1000));
                        setPhase("check");
                    } else {
                        const titleMap: Record<string, string> = {
                            DRIVE_CLOSED: "Job Posting Expired",
                            LINK_EXPIRED: "Link Expired",
                            SLOT_EXPIRED: "Slot Expired",
                            NOT_SCHEDULED: "Not Scheduled",
                            INTERVIEW_COMPLETED: "Interview Completed",
                            INTERVIEW_FAILED: "Interview Ended",
                            INTERVIEW_IN_PROGRESS: "Interview In Progress",
                        };
                        setBlockedAccessTitle(titleMap[data.code] || "Access Restricted");
                        setBlockedAccessMessage(data.error);
                        setIsInitiallyLocked(true);
                    }
                } else {
                    if (data.scheduledAt) setScheduledAt(new Date(data.scheduledAt));
                    setPhase("check");
                }
            } catch (err) {
                if (active) setPhase("check");
            }
        })();
        return () => { active = false; };
    }, [id, interviewToken]);

    // Countdown tick -- counts down to slot time exactly; when <= 0, button unlocks
    useEffect(() => {
        if (!scheduledAt || slotCountdownSecs === null) return;
        if (slotCountdownSecs <= 0) return; // already unlocked
        const interval = setInterval(() => {
            const secsLeft = Math.ceil((scheduledAt.getTime() - Date.now()) / 1000);
            setSlotCountdownSecs(secsLeft);
            if (secsLeft <= 0) clearInterval(interval);
        }, 1000);
        return () => clearInterval(interval);
    }, [scheduledAt, slotCountdownSecs]);
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
    // Single condition: agent ready -- slot time is checked by token API
    // (Server won't issue token if outside ±5 min window, so we know slot time is OK here)
    useEffect(() => {
        if (phase !== "launching") return;
        if (!isAgentReady || agentReadyCommittedRef.current) return;
        agentReadyCommittedRef.current = true;
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
        | { ok: false; message: string; title?: string };
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
                const errorCode = String(data?.code || "").toUpperCase();
                const isInProgress = errorCode === "INTERVIEW_IN_PROGRESS" || /in progress/i.test(apiError);
                const isCompleted = errorCode === "INTERVIEW_COMPLETED";
                const isFailed = errorCode === "INTERVIEW_FAILED";
                const isDriveClosed = errorCode === "DRIVE_CLOSED";
                const isSlotExpired = errorCode === "SLOT_EXPIRED";
                const isTooEarly = errorCode === "TOO_EARLY";
                const isLinkExpired = errorCode === "LINK_EXPIRED";
                if (isInProgress) {
                    return {
                        ok: false,
                        title: "Interview in progress",
                        message: "This interview is already in progress. Please wait for the current session to finish.",
                    };
                }
                if (isCompleted) {
                    return {
                        ok: false,
                        title: "Interview completed",
                        message: apiError,
                    };
                }
                if (isFailed) {
                    return {
                        ok: false,
                        title: "Interview ended",
                        message: apiError,
                    };
                }
                if (isDriveClosed) {
                    return {
                        ok: false,
                        title: "Job posting expired",
                        message: apiError,
                    };
                }
                if (isSlotExpired) {
                    return {
                        ok: false,
                        title: "Slot expired",
                        message: apiError,
                    };
                }
                if (isLinkExpired) {
                    return {
                        ok: false,
                        title: "Link expired",
                        message: apiError,
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
                setActiveFocusViolation((prev) => (prev === "fullscreen_exit" ? null : prev));
                focusEventInFlightRef.current = false;
            }
        } catch (err) {
            console.warn("Fullscreen request failed:", err);
            focusEventInFlightRef.current = false;
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
        stopAllHardwareTracksGlobally();
        setShouldConnect(false);
        const room = lkRoomRef.current;
        if (!room) return;
        try {
            void room.localParticipant.setCameraEnabled(false).catch(() => { });
        } catch { }
        try {
            void room.localParticipant.setMicrophoneEnabled(false).catch(() => { });
        } catch { }
        try {
            for (const publication of room.localParticipant.trackPublications.values()) {
                publication.track?.mediaStreamTrack.stop();
                publication.track?.stop();
            }
        } catch { }
        try {
            void room.disconnect(true).catch(() => { });
        } catch { }
        lkRoomRef.current = null;
    }, []);
    const beginFinalizingInterview = useCallback(() => {
        stopInterviewMedia();
        setPhase("finalizing");
    }, [stopInterviewMedia]);
    const completeInterviewFeedback = useCallback((reason: "normal" | "timeout" = "normal") => {
        stopInterviewMedia();
        setEndMode(reason);
        setPhase("completed");
        void exitFullscreenMode();
    }, [exitFullscreenMode, stopInterviewMedia]);
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
        interviewStartSyncQueuedRef.current = false;
        launchStartedAtRef.current = null;
        setLaunchTimeoutCheck(0);
        setLaunchRecoveryMessage(null);
        setPhase("check");
    }, [exitFullscreenMode, stopInterviewMedia]);
    useEffect(() => {
        if (phase !== "interview") return;
        if (interviewStartSyncQueuedRef.current) return;
        interviewStartSyncQueuedRef.current = true;
        const startedAtMs = Date.now();
        interviewStartedAtRef.current = startedAtMs;
        const dur = sessionDurationRef.current;
        if (typeof dur === "number" && Number.isFinite(dur) && dur > 0) {
            setInterviewEndsAt(startedAtMs + dur * 1000);
            setRemainingSeconds(dur);
            setTimerExpired(false);
        }
        // Re-assert fullscreen here: the request made back in "launching" can be silently
        // dropped by a mic/camera permission prompt or device-track mount on a fresh
        // browser profile. Without this, the exit-listener attached below initializes
        // wasFullscreenRef to an already-false state and never fires a real exit event,
        // while the UI still behaves as if fullscreen is required -- looks like an
        // instant, unexplained bounce back to hardware check.
        void requestFullscreenMode();
        // Grace period: don't flag fullscreen exits during first 10 seconds of interview
        // (browser startup, LiveKit connection, audio initialization may cause spurious events)
        // Fullscreen request takes time, greeting audio plays, room connection stabilizes
        fullscreenStableRef.current = false;
        const stabilizeTimer = window.setTimeout(() => {
            fullscreenStableRef.current = true;
        }, 10000);
        let cancelled = false;
        const persistInterviewStart = async (attempt = 0) => {
            if (cancelled) return;
            try {
                const res = await fetch(`/api/interview/${encodeURIComponent(id)}/start`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        token: interviewToken,
                        startedAtMs,
                    }),
                    keepalive: true,
                });
                const data = await res.json().catch(() => ({}));
                if (cancelled) return;
                if (res.ok) return;
                const errorCode = String(data?.code || "").toUpperCase();
                const errorMessage = String(data?.error || data?.message || "Unable to record interview start.");
                if (res.status === 401 || res.status === 403 || errorCode === "LINK_EXPIRED" || errorCode === "DRIVE_CLOSED") {
                    await resetToHardwareCheck(errorMessage);
                    return;
                }
                if (attempt < 1) {
                    window.setTimeout(() => {
                        void persistInterviewStart(attempt + 1);
                    }, 1000);
                    return;
                }
                console.warn("[Interview Start] Failed to persist start time:", data);
            } catch (err) {
                if (cancelled) return;
                if (attempt < 1) {
                    window.setTimeout(() => {
                        void persistInterviewStart(attempt + 1);
                    }, 1000);
                    return;
                }
                console.error("[Interview Start] Failed to enqueue start time:", err);
            }
        };
        void persistInterviewStart();
        return () => {
            cancelled = true;
            window.clearTimeout(stabilizeTimer);
        };
    }, [id, interviewToken, phase, resetToHardwareCheck, requestFullscreenMode]);
    // Hard timeout: if agent never becomes ready within 1.5 minutes (90s), show a popup and return to check.
    useEffect(() => {
        if (phase !== "launching") return;
        if (launchTimeoutCheck >= 300 && !agentReadyCommittedRef.current) {
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
        void (async () => {
            try {
                const warmResult = await ensureWarmConnection();
                if (!warmResult.ok) {
                    await resetToHardwareCheck();
                    setBlockedAccessTitle(warmResult.title || "Access Restricted");
                    setBlockedAccessMessage(warmResult.message);
                    return;
                }
                // Move the UI into the launching state only after we know the interview can start.
                connectionAttemptRef.current += 1;
                agentReadyCommittedRef.current = false;
                interviewStartSyncQueuedRef.current = false;
                launchStartedAtRef.current = performance.now();
                setLaunchRecoveryMessage(null);
                setIsAgentReady(false);
                setAgentReadyLatencyMs(null);
                setPhase("launching");
                const durationSeconds = sessionDurationRef.current;
                if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
                    throw new Error("Interview duration is not configured for this drive.");
                }
                await requestFullscreenMode();
                if (lkRoomRef.current) {
                    void lkRoomRef.current.startAudio().catch(() => { });
                }
                // Timer starts when interview phase begins (when greeting audio plays),
                // not during launching. See the setPhase("interview") effect above.
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
        const anyFocusSignalEnabled = isTabSwitchEnabled || isFullscreenExitEnabled || isWindowFocusLossEnabled;
        if (phase !== "interview" || !anyFocusSignalEnabled) {
            setActiveFocusViolation(null);
            clearDelayedViolation(tabViolationTimerRef);
            focusEventInFlightRef.current = false;
            return;
        }
        // Logs exactly one of tab_switch / fullscreen_exit / window_focus_loss per physical
        // action. focusEventInFlightRef ensures only the first listener to see a given
        // focus-loss transition logs it -- the others (which may fire for the same DOM
        // transition, e.g. exiting fullscreen also blurs the window) skip.
        const logFocusViolation = (
            kind: FocusSignalKind,
            reason: string,
            severity: "medium" | "high",
        ) => {
            if (tabViolationTimerRef.current !== null) return;
            // Capture elapsed time at the moment the event fires, before the grace delay.
            const detectedAt = Date.now();
            const elapsedMs = interviewStartedAtRef.current ? detectedAt - interviewStartedAtRef.current : null;
            // 1500ms grace window: OS notifications (Slack, email) typically steal focus
            // for <500ms and self-resolve. Only fire after sustained focus loss.
            tabViolationTimerRef.current = window.setTimeout(() => {
                tabViolationTimerRef.current = null;
                focusEventInFlightRef.current = false;
                const elapsedSeconds = elapsedMs !== null ? Math.floor(elapsedMs / 1000) : null;
                const elapsedLabel = elapsedSeconds !== null
                    ? `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s into interview`
                    : null;
                setFocusViolationElapsed(elapsedLabel);
                setFocusSignalCounts(prev => {
                    const next = { ...prev, [kind]: prev[kind] + 1 };
                    if (SHOW_TAB_FULLSCREEN_ALERTS) {
                        setActiveFocusViolation(kind);
                    }
                    return next;
                });
                fetch("/api/interview/proctoring", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        applicationId: id,
                        interviewToken: interviewToken,
                        events: [{
                            eventType: kind,
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
        // Fullscreen exit fires immediately (no grace window -- leaving fullscreen is a
        // deliberate action), no grace window; the immediate-fire below happens inline.
        const logFullscreenExit = () => {
            focusEventInFlightRef.current = true;
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
                        eventType: "fullscreen_exit",
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
            setFocusSignalCounts(prev => ({ ...prev, fullscreen_exit: prev.fullscreen_exit + 1 }));
            if (SHOW_TAB_FULLSCREEN_ALERTS) {
                setFocusViolationElapsed(fsElapsedLabel ?? null);
                setActiveFocusViolation("fullscreen_exit");
            }
        };
        const onVisibilityChange = () => {
            if (document.hidden) {
                // fullscreenchange fires first for an Esc/F11 exit and already claimed
                // the transition -- don't double-count it as a tab switch too.
                if (focusEventInFlightRef.current) return;
                if (!isTabSwitchEnabled) return;
                focusEventInFlightRef.current = true;
                logFocusViolation("tab_switch", "Tab Switched", "medium");
            } else {
                focusEventInFlightRef.current = false;
                clearDelayedViolation(tabViolationTimerRef);
            }
        };
        const onWindowBlur = () => {
            // Skip if visibilitychange or fullscreenchange already handled this transition -- 
            // window_focus_loss is the catch-all fallback, lowest priority of the three.
            if (focusEventInFlightRef.current) return;
            if (!isWindowFocusLossEnabled) return;
            focusEventInFlightRef.current = true;
            logFocusViolation("window_focus_loss", "Window Lost Focus", "medium");
        };
        const onWindowFocus = () => {
            focusEventInFlightRef.current = false;
            clearDelayedViolation(tabViolationTimerRef);
        };
        const onFullscreenChange = () => {
            const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement || (document as any).msFullscreenElement);
            // Only log exit if: (1) we were in fullscreen, (2) we're now out, (3) interview is stable (2s grace period passed)
            if (!isFS && wasFullscreenRef.current && fullscreenStableRef.current) {
                if (isFullscreenExitEnabled) {
                    logFullscreenExit();
                }
            }
            if (isFS) {
                focusEventInFlightRef.current = false;
                clearDelayedViolation(tabViolationTimerRef);
            }
            wasFullscreenRef.current = isFS;
        };
        // Initialize wasFullscreenRef to current state when attaching listeners
        const initialIsFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement || (document as any).msFullscreenElement);
        wasFullscreenRef.current = initialIsFS;

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
            focusEventInFlightRef.current = false;
        };
    }, [phase, id, clearDelayedViolation, isTabSwitchEnabled, isFullscreenExitEnabled, isWindowFocusLossEnabled]);
    // Fingerprint re-check every 120s during interview
    useEffect(() => {
        if (phase !== "interview") {
            if (fingerprintIntervalRef.current !== null) {
                clearInterval(fingerprintIntervalRef.current);
                fingerprintIntervalRef.current = null;
            }
            return;
        }
        const send = () => {
            const fingerprint = collectFingerprint();
            fetch("/api/interview/proctoring", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    applicationId: id,
                    interviewToken,
                    events: [{
                        eventType: "ip_registered",
                        severity: "low",
                        timestamp: Date.now(),
                        metadata: { fingerprint },
                    }],
                }),
            }).catch(() => { });
        };
        send();
        fingerprintIntervalRef.current = window.setInterval(send, 120_000);
        return () => {
            if (fingerprintIntervalRef.current !== null) {
                clearInterval(fingerprintIntervalRef.current);
                fingerprintIntervalRef.current = null;
            }
        };
    }, [phase, id, interviewToken, collectFingerprint]);
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
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 text-violet-500">
                                <ShieldAlert className="h-8 w-8" />
                            </div>
                            <h2 className="text-2xl font-black tracking-tight text-gray-900">
                                {blockedAccessTitle}
                            </h2>
                            <p className="mt-3 text-sm leading-6 text-gray-600">
                                {blockedAccessMessage}
                            </p>
                            <p className="mt-3 text-sm font-semibold text-gray-700">
                                Please contact the support team:{" "}
                                <a href="mailto:support@sreevaai.com" className="text-violet-600 underline decoration-orange-300 underline-offset-2">
                                    support@sreevaai.com
                                </a>
                            </p>
                            <div className="mt-6 flex justify-center gap-3">
                                {!isInitiallyLocked && (
                                    <Button
                                        onClick={() => setBlockedAccessMessage(null)}
                                        className="rounded-full bg-violet-500 px-6 py-2.5 text-white font-bold hover:bg-violet-600"
                                    >
                                        Got it
                                    </Button>
                                )}
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
                        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
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
                            title={`${organizationName ? `${organizationName} - ` : ""}${interviewRoleLabel} Interview Check`}
                            slotCountdownSecs={slotCountdownSecs}
                        />
                    </motion.div>
                )}
                {phase === "launching" && (
                    <motion.div
                        key="launching"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 min-h-screen w-full flex items-center justify-center bg-[#FAFAFC] z-[120] absolute inset-0"
                    >
                        <div className="flex flex-col items-center gap-8 text-center px-6">

                            {/* Minimalist Breathing AI Core */}
                            <div className="relative h-24 w-24 rounded-full bg-white border border-violet-100 flex items-center justify-center shadow-sm">
                                <div className="relative flex items-center justify-center h-12 w-12">
                                    {/* Ripple 1 */}
                                    <motion.div
                                        className="absolute inset-0 rounded-full bg-violet-500/20"
                                        animate={{ scale: [1, 2.5], opacity: [1, 0] }}
                                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
                                    />
                                    {/* Ripple 2 */}
                                    <motion.div
                                        className="absolute inset-0 rounded-full bg-violet-500/20"
                                        animate={{ scale: [1, 2.5], opacity: [1, 0] }}
                                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut", delay: 1.25 }}
                                    />
                                    {/* Solid Core */}
                                    <motion.div
                                        className="relative h-6 w-6 bg-violet-600 rounded-full shadow-[0_0_20px_rgba(124,58,237,0.4)]"
                                        animate={{ scale: [1, 1.2, 1] }}
                                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                                    />
                                </div>
                            </div>

                            {/* Professional Typography */}
                            <div className="space-y-2">
                                <h3 className="text-2xl font-semibold text-gray-900 tracking-tight">
                                    {isAgentReady ? "Interviewer is Ready" : "Preparing Interview Room"}
                                </h3>
                                <p className="text-sm text-gray-500 max-w-[320px] mx-auto">
                                    {isAgentReady
                                        ? "Starting your session now..."
                                        : "Please wait a moment while we securely connect your AI interviewer."}
                                </p>
                            </div>

                            {/* Horizontal Pill Checklist */}
                            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                                {([
                                    { label: "Camera & Microphone", done: true },
                                    { label: "Secure Connection", done: !!token },
                                    { label: "AI Interviewer", done: isAgentReady },
                                ]).map((step, i, arr) => (
                                    <div key={step.label} className="flex items-center gap-2">
                                        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border transition-all ${step.done
                                            ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                                            : "bg-white border-gray-200 text-gray-500 shadow-sm"
                                            }`}>
                                            {step.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                                            {step.label}
                                        </div>
                                        {i < arr.length - 1 && <div className="hidden sm:block w-6 h-[1.5px] bg-gray-200 rounded-full" />}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
                {launchRecoveryMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 backdrop-blur-sm"
                    >
                        <div className="w-[min(92vw,520px)] rounded-[2rem] bg-white p-8 shadow-2xl border border-black/5 text-center">
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-violet-500 mb-3">Hold on</p>
                            <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                                {launchRecoveryMessage}
                            </h3>
                            <p className="mt-4 text-sm font-medium text-gray-500">
                                {returnCountdown !== null ? `We'll return you to the hardware check screen in ${returnCountdown}s...` : "We'll return you to the hardware check screen in a moment."}
                            </p>
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
                                <Loader2 className="h-16 w-16 text-violet-500 animate-spin" />
                                <ShieldCheck className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-violet-600" />
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
            {token && serverUrl && phase !== "completed" && phase !== "finalizing" && (
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
                            onFinish={completeInterviewFeedback}
                            onFinalizing={beginFinalizingInterview}
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
                            onFatalError={showFatalError}
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
                {SHOW_TAB_FULLSCREEN_ALERTS && activeFocusViolation && phase === "interview" && (() => {
                    const kind = activeFocusViolation;
                    const count = focusSignalCounts[kind];
                    const isHighSeverity = kind === "fullscreen_exit" || count >= 3;
                    const COPY: Record<FocusSignalKind, { title: string; body: string }> = {
                        tab_switch: {
                            title: "Focus Lost",
                            body: count === 1
                                ? "You switched away from this tab. This incident has been logged for review."
                                : `You have switched tabs ${count} times. Repeated incidents are flagged for recruiter review.`,
                        },
                        fullscreen_exit: {
                            title: "Fullscreen Exited",
                            body: "You exited fullscreen mode. Please stay in fullscreen during the interview.",
                        },
                        window_focus_loss: {
                            title: "Window Focus Lost",
                            body: count === 1
                                ? "Your browser window lost focus. This incident has been logged for review."
                                : `Your browser window has lost focus ${count} times. Repeated incidents are flagged for recruiter review.`,
                        },
                    };
                    const copy = COPY[kind];
                    return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center p-6"
                        >
                            <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
                                <div className={`mx-auto w-20 h-20 rounded-2xl flex items-center justify-center ${isHighSeverity ? "bg-red-500/10" : "bg-violet-500/10"}`}>
                                    <ShieldAlert className={`w-10 h-10 ${isHighSeverity ? "text-red-500" : "text-violet-500"}`} />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                                        {copy.title}
                                    </h2>
                                    <p className="text-zinc-400 text-sm font-medium leading-relaxed">
                                        {copy.body}
                                    </p>
                                </div>
                                <div className="pt-4 flex flex-col gap-3">
                                    <Button
                                        onClick={() => {
                                            setActiveFocusViolation(null);
                                            // Re-entering fullscreen needs a user gesture -- this click is it.
                                            if (kind === "fullscreen_exit") void requestFullscreenMode();
                                        }}
                                        className={`w-full text-white font-black uppercase tracking-widest py-6 rounded-2xl transition-all active:scale-95 ${isHighSeverity
                                            ? "bg-red-500 hover:bg-red-600 shadow-[0_10px_20px_-10px_rgba(239,68,68,0.5)]"
                                            : "bg-violet-500 hover:bg-violet-600 shadow-[0_10px_20px_-10px_rgba(124,58,237,0.5)]"}`}
                                    >
                                        {kind === "fullscreen_exit" ? "Return to Fullscreen" : "I Understand & Continue"}
                                    </Button>
                                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                        Incident {count > 1 ? `${count} of session` : "logged"} · Under review
                                    </div>
                                    {focusViolationElapsed && (
                                        <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest">
                                            Detected at {focusViolationElapsed}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    );
                })()}
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
                        <div className="flex items-center gap-3 bg-zinc-900/90 backdrop-blur-md border border-violet-500/30 rounded-2xl px-5 py-3 shadow-2xl max-w-sm">
                            <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                                {faceViolationAlert.type === "multiple_faces" ? (
                                    <Users className="w-4 h-4 text-violet-500" />
                                ) : faceViolationAlert.type === "face_absence" ? (
                                    <EyeOff className="w-4 h-4 text-violet-500" />
                                ) : (
                                    <Eye className="w-4 h-4 text-violet-500" />
                                )}
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-violet-500">
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
                            <div className="h-8 w-8 rounded-lg bg-violet-500 text-white flex items-center justify-center">
                                <ShieldAlert className="h-4 w-4" />
                            </div>
                            <DialogTitle className="text-xl font-black tracking-tight uppercase tracking-widest">Interview Guidelines</DialogTitle>
                        </div>
                        <DialogDescription className="sr-only">
                            Interview guidelines and proctoring reminders shown before the candidate starts the session.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="space-y-4">
                            {[
                                { title: "Proctored Session", text: "This interview is proctored, so please do not try to cheat." },
                                { title: "Quiet Environment", text: "Sit in a quiet environment with no interruptions." },
                                { title: "Reporting Issues", text: "If you face any issue, use the Contact button right away." }
                            ].map((item, i) => (
                                <div key={i} className="flex gap-4 p-5 rounded-3xl bg-gray-50 border border-gray-100 transition-all hover:bg-violet-50/30 hover:border-violet-100 group">
                                    <div className="w-10 h-10 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-violet-500 font-black text-sm shadow-sm group-hover:border-violet-200">
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
                        <DialogDescription className="sr-only">
                            Send a support request if you are facing a technical issue during the interview.
                        </DialogDescription>
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
                                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
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
                                className="rounded-xl bg-[#7C3AED] text-white hover:bg-violet-600"
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
    onFatalError,
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
    onFatalError?: () => void;
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
            onFatalError?.();
        };
        lkRoom.on(RoomEvent.Disconnected, handleRoomDisconnected);
        return () => {
            lkRoom.off(RoomEvent.Disconnected, handleRoomDisconnected);
        };
    }, [lkRoom, isInterviewActive, onFatalError]);
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
    const [micTogglePending, setMicTogglePending] = useState(false);
    const didAutoEnableMicRef = useRef(false);
    const toggleMic = useCallback(async () => {
        if (!localParticipant || micTogglePending) return;
        const nextEnabled = !localParticipant.isMicrophoneEnabled;
        setMicTogglePending(true);
        try {
            await localParticipant.setMicrophoneEnabled(
                nextEnabled,
                nextEnabled && selectedMicId ? { deviceId: selectedMicId } : undefined
            );
        } catch (err) {
            console.warn("[Mic] Failed to toggle microphone:", err);
        } finally {
            setMicTogglePending(false);
        }
    }, [localParticipant, micTogglePending, selectedMicId]);

    const isCameraEnabled = localParticipant?.isCameraEnabled ?? false;
    const [cameraTogglePending, setCameraTogglePending] = useState(false);
    const toggleCamera = useCallback(async () => {
        if (!localParticipant || cameraTogglePending) return;
        const nextEnabled = !localParticipant.isCameraEnabled;
        setCameraTogglePending(true);
        try {
            await localParticipant.setCameraEnabled(nextEnabled);
        } catch (err) {
            console.warn("[Camera] Failed to toggle camera:", err);
        } finally {
            setCameraTogglePending(false);
        }
    }, [localParticipant, cameraTogglePending]);
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
    const launchReadySignalSentRef = useRef(false);
    const [launchPrereqsReady, setLaunchPrereqsReady] = useState(false);
    const finishStartedRef = useRef(false);
    const egressStartedRef = useRef(false);
    const egressStartingRef = useRef<Promise<void> | null>(null);
    const egressStoppingRef = useRef<Promise<void> | null>(null);
    const egressStopRequestedRef = useRef(false);
    const transcriptPanelRef = useRef<HTMLDivElement>(null);
    const postEgressAction = useCallback(async (action: "start" | "stop" | "status", keepalive = false) => {
        const response = await fetch("/api/interview/egress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action,
                applicationId: id,
                interviewToken: interviewToken || "",
            }),
            keepalive,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(String(payload?.error || `Egress ${action} failed with status ${response.status}`));
        }
        return payload;
    }, [id, interviewToken]);
    const startServerRecording = useCallback(async () => {
        if (egressStartedRef.current) return;
        if (egressStartingRef.current) {
            await egressStartingRef.current;
            return;
        }
        const promise = postEgressAction("start")
            .then(() => {
                egressStartedRef.current = true;
                egressStopRequestedRef.current = false;
            })
            .finally(() => {
                egressStartingRef.current = null;
            });
        egressStartingRef.current = promise;
        await promise;
    }, [postEgressAction]);
    const stopServerRecording = useCallback(async () => {
        if ((!egressStartedRef.current && !egressStartingRef.current) || egressStopRequestedRef.current) return;
        if (egressStoppingRef.current) {
            await egressStoppingRef.current;
            return;
        }
        egressStopRequestedRef.current = true;
        const promise = (async () => {
            if (egressStartingRef.current) {
                await egressStartingRef.current.catch(() => { });
            }
            if (!egressStartedRef.current) return;
            await postEgressAction("stop");
            egressStartedRef.current = false;
        })().catch((error) => {
            egressStopRequestedRef.current = false;
            throw error;
        }).finally(() => {
            egressStoppingRef.current = null;
        });
        egressStoppingRef.current = promise;
        await promise;
    }, [postEgressAction]);
    const stopServerRecordingKeepalive = useCallback(() => {
        if ((!egressStartedRef.current && !egressStartingRef.current) || egressStopRequestedRef.current) return;
        egressStopRequestedRef.current = true;
        egressStartedRef.current = false;
        const payload = JSON.stringify({
            action: "stop",
            applicationId: id,
            interviewToken: interviewToken || "",
        });
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
            try {
                const accepted = navigator.sendBeacon(
                    "/api/interview/egress",
                    new Blob([payload], { type: "application/json" })
                );
                if (accepted) return;
            } catch {
                // Fall through to keepalive fetch.
            }
        }
        void fetch("/api/interview/egress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
        }).catch(() => { });
    }, [id, interviewToken]);
    // Agent readiness in launch phase is gated by:
    // 1) room connection + agent presence
    // 2) explicit backend signal that prefetch + greeting prerequisites are ready
    // 3) assistant state MUST be "speaking" -- this means greeting audio has actually
    //    arrived at the browser. Do NOT include "listening" here: the agent briefly
    //    enters listening state between session start and the first TTS audio chunk,
    //    which would fire the transition before any audio plays (causing 10-15s of
    //    silence in the interview UI while TTS is still synthesizing).
    // IMPORTANT: onAgentReady is a one-way latch. Once we fire true we never send false
    // again - the parent commits the phase change and a subsequent false (when assistantState
    // moves from "speaking" -> "listening") would race and reset isAgentReady before
    // the transition effect runs, leaving the launch screen permanently stuck.
    useEffect(() => {
        if (!isLaunchingActive) {
            // Reset the latch when a new launch attempt starts
            launchReadySignalSentRef.current = false;
            setLaunchPrereqsReady(false);
            return;
        }
        // Already fired - do nothing more
        if (launchReadySignalSentRef.current) return;
        const readyNow = connectionState === "connected"
            && hasAgentPresence
            && launchPrereqsReady
            && assistantState === "speaking"; // ONLY "speaking" — never "listening"
        if (readyNow) {
            launchReadySignalSentRef.current = true;
            console.log("[Agent] Greeting audio confirmed playing - transitioning to interview");
            onAgentReady?.(true);
        }
    }, [isLaunchingActive, connectionState, hasAgentPresence, launchPrereqsReady, assistantState, onAgentReady]);
    // Start server-side LiveKit egress recording when interview becomes active.
    useEffect(() => {
        if (!isInterviewActive || egressStartedRef.current) return;
        let cancelled = false;
        let retryTimer: number | null = null;
        const attemptStart = async () => {
            if (cancelled || egressStartedRef.current) return;
            try {
                await startServerRecording();
            } catch (error) {
                const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
                if (message.includes("recording is disabled") || message.includes("recording_disabled")) {
                    console.warn("[Egress] Recording disabled for this organization. Skipping retries.");
                    return;
                }
                console.warn("[Egress] Start failed. Retrying...", error);
                retryTimer = window.setTimeout(() => {
                    void attemptStart();
                }, 1200);
            }
        };
        void attemptStart();
        return () => {
            cancelled = true;
            if (retryTimer !== null) {
                window.clearTimeout(retryTimer);
            }
        };
    }, [isInterviewActive, startServerRecording]);
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
                } else if (packet.type === "interview_failed") {
                    onFatalError?.();
                } else if (packet.type === "launch_prereqs_ready") {
                    setLaunchPrereqsReady(Boolean(packet.ready));
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
    }, [lkRoom, onAgentDetectedViolation, onFatalError]);
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
        // Keep the room alive briefly while egress stop is requested server-side.
        const stopTimeoutMs = 10000;
        const stopPromise = stopServerRecording().catch((err) => {
            console.warn("[Egress] Background stop failed:", err);
        });
        onFinalizing();
        await Promise.race([
            stopPromise,
            new Promise<void>((resolve) => {
                window.setTimeout(resolve, stopTimeoutMs);
            }),
        ]);
        onFinish(reason);
    }, [lkRoom, onFinalizing, onFinish, stopServerRecording]);
    useEffect(() => {
        if (isInterviewActive) return;
        void stopServerRecording().catch(() => { });
    }, [isInterviewActive, stopServerRecording]);
    useEffect(() => {
        const handlePageHide = () => {
            if (!isInterviewActive) return;
            stopServerRecordingKeepalive();
        };
        window.addEventListener("pagehide", handlePageHide);
        return () => window.removeEventListener("pagehide", handlePageHide);
    }, [isInterviewActive, stopServerRecordingKeepalive]);
    useEffect(() => {
        if (!timerExpired || !isInterviewActive) return;
        void handleFinish("normal");
    }, [timerExpired, isInterviewActive, handleFinish]);
    useEffect(() => {
        if (!remoteForceFinish || !isInterviewActive) return;
        void handleFinish(remoteForceFinishReason);
    }, [remoteForceFinish, remoteForceFinishReason, isInterviewActive, handleFinish]);
    return (
        <div className="flex-1 flex flex-col h-full w-full relative bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 text-zinc-900 overflow-hidden">
            {/* Soft Background Blobs (Optional, the gradient does most of the work) */}
            <div className="absolute top-0 left-0 w-full h-full bg-white/40 pointer-events-none backdrop-blur-3xl" />

            {/* Top Navigation Bar */}
            <div className="absolute top-0 left-0 right-0 z-[60] flex items-center justify-between px-8 py-6 pointer-events-none">
                <div className="flex items-center gap-1.5 pointer-events-auto">
                    <img src="/sreevaailogo2.png" alt="SreevaAI" className="h-8 object-contain drop-shadow-sm" />
                    <p className="text-xl font-bold text-zinc-800 tracking-tight">SreevaAI</p>
                </div>

                {/* Time */}
                <div className="flex items-center gap-4 pointer-events-auto">
                    <p className="text-sm font-medium text-zinc-700 tabular-nums ml-4">10:35 AM</p>
                </div>
            </div>

            {/* Status Pill removed in favor of center voice UI */}

            {/* Candidate Video Feed - TOP RIGHT */}
            <div className="absolute top-24 right-10 z-50 pointer-events-auto flex flex-col items-end gap-3">
                <div className="w-72 aspect-video rounded-3xl p-[3px] bg-gradient-to-b from-white/80 to-white/30 shadow-[0_12px_40px_rgba(0,0,0,0.12)] backdrop-blur-md">
                    <div className="w-full h-full rounded-[22px] overflow-hidden bg-black relative">
                        {localCameraTrack ? (
                            <div className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover scale-x-[-1]">
                                <VideoTrack trackRef={localCameraTrack} />
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
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{interviewRoleLabel || "Interviewing"}</p>
                </div>
            </div>
            {/* AI Avatar Area */}
            <div className="flex-1 flex flex-col items-center justify-center relative -mt-4">
                <div className="relative w-[16rem] h-[16rem] flex items-center justify-center group shrink-0" style={{ transform: 'translateZ(0)' }}>

                    {/* Minimalist Breathing Rings (Replaces Blob) */}
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

                    {/* Voice Interface Center */}
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

                <div className="mt-12 mb-20 w-full max-w-5xl px-8 text-center z-20 shrink-0">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={latestAiTranscript?.id || "placeholder"}
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
                                {latestAiTranscript ? latestAiTranscript.text : "We are incredibly impressed by your extensive background in artificial intelligence and machine learning architectures, particularly your recent work optimizing large language models for edge devices. Could you walk us through a specific challenge you faced while balancing inference speed with accuracy during deployment, and detail the architectural compromises you had to make to achieve those strict latency requirements?"}
                                {latestAiTranscript && !latestAiTranscript.isFinal && <span className="animate-pulse">...</span>}
                            </p>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Sleek Floating Dock - BOTTOM CENTER */}
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

                    <button onClick={() => setInstructionsDialogOpen(true)} className="flex flex-col items-center gap-2 transition-all group w-14">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center transition-all bg-zinc-100 group-hover:bg-zinc-200">
                            <AlertCircle className="w-5 h-5 text-zinc-600" />
                        </div>
                        <span className="text-[10px] font-medium text-zinc-600">Guidelines</span>
                    </button>

                    <button onClick={() => setSupportDialogOpen(true)} className="flex flex-col items-center gap-2 transition-all group w-14">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center transition-all bg-zinc-100 group-hover:bg-zinc-200">
                            <LifeBuoy className="w-5 h-5 text-zinc-600" />
                        </div>
                        <span className="text-[10px] font-medium text-zinc-600">Support</span>
                    </button>

                    <button onClick={() => handleFinish("normal")} className="flex flex-col items-center gap-2 transition-all group w-14 ml-2">
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
function InterviewPage({ params }: InterviewPageProps) {
    const { id } = use(params);
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-white text-gray-400">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                        <div className="w-20 h-20 border-4 border-violet-500/10 rounded-full animate-spin border-t-orange-500" />
                        <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-violet-500 animate-pulse" />
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
            <div className="w-24 h-24 bg-gradient-to-br from-violet-500 to-violet-700 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-[0_20px_40px_rgba(124,58,237,0.3)] rotate-3">
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
