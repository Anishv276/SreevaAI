"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Mic, CheckCircle2, AlertCircle, Loader2, Volume2, ChevronDown, Zap, Play, Wifi } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
const SPEAKER_PROMPTS = [
    "Almost ready for your interview. Listen for the word {word} and click Yes.",
    "Quick audio check before we begin. When you hear {word}, tap Yes.",
    "Making sure your speakers are working. Catch the word {word} and click Yes.",
    "One small step before your interview starts. Hear {word} and press Yes.",
    "Your interview is almost set. When you hear {word}, go ahead and click Yes.",
    "Let us confirm your audio is clear. Listen for {word} and click Yes.",
    "Final check before we launch. When you catch the word {word}, hit Yes.",
    "Nearly there. Listen carefully for {word} and click Yes when you hear it.",
];
interface HardwareCheckProps {
    onComplete: (devices?: { cameraId?: string; micId?: string }) => void | Promise<void>;
    onRetry?: () => void;
    isStarting?: boolean;
    errorMessage?: string | null;
    slotCountdownSecs?: number | null;
    candidateName?: string;
    applicationId?: string;
    interviewToken?: string;
    title?: string;
}
type CheckStatus = "idle" | "requesting" | "granted" | "denied";
export function HardwareCheck({
    onComplete,
    isStarting = false,
    candidateName = "candidate",
    applicationId = "unknown",
    interviewToken = "",
    slotCountdownSecs = null,
}: HardwareCheckProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const animRef = useRef<number | null>(null);
    // Web Speech API recognizer -- in-browser only, no server round-trip.
    // ponytail: "any speech detected" is the whole check, no phrase/word matching.
    const recogRef = useRef<any>(null);
    const snapshotDoneRef = useRef(false);
    const faceCountHistoryRef = useRef<number[]>([]); // 5-frame buffer for temporal consensus
    const [cameraStatus, setCameraStatus] = useState<CheckStatus>("idle");
    const [micStatus, setMicStatus] = useState<CheckStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
    const [snapshotUploading, setSnapshotUploading] = useState(false);
    const [consentChecked, setConsentChecked] = useState(false);
    const [micVolumeLevel, setMicVolumeLevel] = useState(0);
    const [canBeginNow, setCanBeginNow] = useState(false);
    const isSlotLocked = slotCountdownSecs !== null && slotCountdownSecs > 0;
    useEffect(() => {
        setCanBeginNow(true);
    }, []);
    // Device Selection
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [selectedMicId, setSelectedMicId] = useState('');
    const [isMicDropdownOpen, setIsMicDropdownOpen] = useState(false);
    const micDropdownRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (micDropdownRef.current && !micDropdownRef.current.contains(event.target as Node)) {
                setIsMicDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    // Speaker / Audio Playback
    const [speakerPlaying, setSpeakerPlaying] = useState(false);
    const [speakerStatus, setSpeakerStatus] = useState<"idle" | "playing" | "awaiting" | "passed" | "failed">("idle");
    const [speakerRetryMsg, setSpeakerRetryMsg] = useState(false);
    const SPEAKER_KEYWORDS = ["READY", "CLEAR", "START", "INTERVIEW"];
    const speakerStatusRef = useRef(speakerStatus);
    const speakerFallbackTimerRef = useRef<number | null>(null);
    useEffect(() => {
        speakerStatusRef.current = speakerStatus;
    }, [speakerStatus]);
    const clearSpeakerFallbackTimer = useCallback(() => {
        if (speakerFallbackTimerRef.current !== null) {
            window.clearTimeout(speakerFallbackTimerRef.current);
            speakerFallbackTimerRef.current = null;
        }
    }, []);
    useEffect(() => () => {
        clearSpeakerFallbackTimer();
    }, [clearSpeakerFallbackTimer]);
    //  Visual Integrity (Signals 4, 5, 6)
    const visualLandmarkerRef = useRef<any>(null);
    const visualRafRef = useRef<number | null>(null);
    const [visualSignals, setVisualSignals] = useState({
        lighting: false,
    });
    const [visualStatusMsg, setVisualStatusMsg] = useState("Initializing visual integrity check...");
    const faceLocked = faceCountHistoryRef.current.filter(c => c === 1).length >= 3;
    const visualReady = faceLocked && visualSignals.lighting;
    useEffect(() => {
        if (cameraStatus !== "granted") return;
        let cancelled = false;
        const initVisualIntegrity = async () => {
            try {
                const { FaceLandmarker: FL, FilesetResolver } = await import("@mediapipe/tasks-vision");
                const vision = await FilesetResolver.forVisionTasks("/mediapipe");
                if (cancelled) return;
                const landmarker = await FL.createFromOptions(vision, {
                    baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate: "GPU" },
                    outputFaceBlendshapes: false,
                    outputFacialTransformationMatrixes: false,
                    runningMode: "VIDEO",
                    numFaces: 1,
                    minFaceDetectionConfidence: 0.7,
                    minFacePresenceConfidence: 0.7,
                    minTrackingConfidence: 0.6,
                });
                if (cancelled) { landmarker.close(); return; }
                visualLandmarkerRef.current = landmarker;
                // Throttle lighting to avoid canvas layout thrashing every frame
                let lastLightingCheck = 0;
                let lastLightGood = false;
                const checkVisuals = () => {
                    if (cancelled) return;
                    visualRafRef.current = requestAnimationFrame(checkVisuals);
                    const video = videoRef.current;
                    if (!video || video.readyState < 2 || video.paused || !visualLandmarkerRef.current) return;
                    let result;
                    try { result = visualLandmarkerRef.current.detectForVideo(video, performance.now()); }
                    catch { return; }
                    const numFaces = result.faceLandmarks?.length ?? 0;
                    faceCountHistoryRef.current.push(numFaces);
                    if (faceCountHistoryRef.current.length > 5) faceCountHistoryRef.current.shift();
                    const validFrames = faceCountHistoryRef.current.filter(c => c === 1).length;
                    const isIdentityLocked = validFrames >= 3;
                    if (!isIdentityLocked || numFaces !== 1) {
                        setVisualSignals({ lighting: lastLightGood });
                        if (numFaces === 0) setVisualStatusMsg("No face detected. Please look at the camera.");
                        else if (numFaces > 1) setVisualStatusMsg("Multiple faces detected. Please ensure you are alone.");
                        else setVisualStatusMsg("Stabilizing...");
                        return;
                    }
                    // Lighting check -- sample from face bounding box
                    const landmarks = result.faceLandmarks[0];
                    if (landmarks && Array.isArray(landmarks) && landmarks.length > 0) {
                        const xs = landmarks.filter(l => l && typeof l.x === 'number').map(l => l.x);
                        const ys = landmarks.filter(l => l && typeof l.y === 'number').map(l => l.y);
                        if (xs.length > 0 && ys.length > 0) {
                            const minX = Math.min(...xs), maxX = Math.max(...xs);
                            const minY = Math.min(...ys), maxY = Math.max(...ys);
                            const widthRatio = maxX - minX;
                            const now = performance.now();
                            if (now - lastLightingCheck > 500) {
                                lastLightingCheck = now;
                                try {
                                    const lc = document.createElement("canvas");
                                    lc.width = 1; lc.height = 1;
                                    const lctx = lc.getContext("2d");
                                    if (lctx && video.videoWidth > 0) {
                                        lctx.drawImage(video, minX * video.videoWidth, minY * video.videoHeight, widthRatio * video.videoWidth, (maxY - minY) * video.videoHeight, 0, 0, 1, 1);
                                        const data = lctx.getImageData(0, 0, 1, 1).data;
                                        const brightness = 0.299 * data[0] + 0.587 * data[1] + 0.114 * data[2];
                                        lastLightGood = brightness >= 70 && brightness <= 200;
                                    }
                                } catch { }
                            }
                        }
                    }
                    setVisualSignals({ lighting: lastLightGood });
                    setVisualStatusMsg(lastLightGood ? "Face detected" : "Lighting is poor");
                };
                visualRafRef.current = requestAnimationFrame(checkVisuals);
            } catch (err) {
                setVisualStatusMsg("Visual check unavailable.");
            }
        };
        void initVisualIntegrity();
        return () => {
            cancelled = true;
            if (visualRafRef.current) cancelAnimationFrame(visualRafRef.current);
            if (visualLandmarkerRef.current) {
                try { visualLandmarkerRef.current.close(); } catch { }
                visualLandmarkerRef.current = null;
            }
        };
    }, [cameraStatus]);
    // Defensive: Ensure camera live feed stream is bound and never freezes on step transition/re-renders
    useEffect(() => {
        if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => { });
        }
    });
    // Browser compatibility
    const [browserSupported, setBrowserSupported] = useState(true);
    const [browserName, setBrowserName] = useState("");
    useEffect(() => {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isAndroid = /Android/.test(ua);
        const isMobile = isIOS || isAndroid;
        const isEdge = /Edg/.test(ua);
        const isChrome = /Chrome/.test(ua) && !isEdge && !/OPR|Brave/.test(ua);
        if (isMobile || (!isChrome && !isEdge)) {
            setBrowserSupported(false);
            if (isMobile) setBrowserName("Mobile device detected");
            else if (/Firefox/.test(ua)) setBrowserName("Firefox detected");
            else if (/Safari/.test(ua) && !/Chrome/.test(ua)) setBrowserName("Safari detected");
            else setBrowserName("Unsupported browser");
        }
    }, []);
    const [micVerified, setMicVerified] = useState(false);
    const [networkStatus, setNetworkStatus] = useState<"checking" | "good" | "poor" | "offline">("checking");
    const [networkLatencyMs, setNetworkLatencyMs] = useState<number | null>(null);
    const cameraFullyReady = cameraStatus === "granted" && faceLocked && visualReady;
    const allReady = cameraFullyReady &&
        micStatus === "granted" &&
        micVerified &&
        (speakerStatus === "passed" || speakerStatus === "failed") &&
        networkStatus !== "offline" &&
        consentChecked;
    useEffect(() => {
        const originalInfo = console.info.bind(console);
        const originalLog = console.log.bind(console);
        const isNoise = (msg: unknown) => {
            const m = typeof msg === "string" ? msg : String(msg);
            return m.includes("XNNPACK") || m.includes("TensorFlow Lite") || m.includes("Created TensorFlow") || m.includes("delegate for CPU");
        };
        console.info = (...args: unknown[]) => { if (!args[0] || !isNoise(args[0])) originalInfo(...args); };
        console.log = (...args: unknown[]) => { if (!args[0] || !isNoise(args[0])) originalLog(...args); };
        return () => { console.info = originalInfo; console.log = originalLog; };
    }, []);
    const uploadSnapshot = useCallback(async (label = "verification") => {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || snapshotDoneRef.current) return;
        const canvas = document.createElement("canvas");
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.translate(640, 0); ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, 640, 480);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setSnapshotUrl(dataUrl);
        // Persist for identity verification during live interview
        try { sessionStorage.setItem("proctor_ref_snapshot", dataUrl); } catch { }
        setSnapshotUploading(true);
        try {
            const r = await fetch("/api/upload/interview-snapshot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    imageDataUrl: dataUrl,
                    candidateName,
                    applicationId,
                    interviewToken,
                    label
                }),
            });
            const resBody = await r.json();
            if (resBody.status === "queued" || resBody.url) {
                snapshotDoneRef.current = true;
            } else {
                console.warn("[Snapshot] API error:", resBody);
            }
        } catch (err) {
            console.error("[Snapshot] Upload failed:", err);
        } finally {
            setSnapshotUploading(false);
        }
    }, [candidateName, applicationId, interviewToken]);
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
            sessionId: crypto.randomUUID(),
            collectedAt: Date.now(),
        };
    }, []);
    const sendFingerprint = useCallback(async () => {
        try {
            const fingerprint = collectFingerprint();
            await fetch("/api/interview/proctoring", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    applicationId,
                    interviewToken,
                    events: [{
                        eventType: "ip_registered",
                        severity: "low",
                        timestamp: Date.now(),
                        metadata: { fingerprint },
                    }],
                }),
            });
        } catch { }
    }, [applicationId, interviewToken, collectFingerprint]);
    const handleBeginInterview = useCallback(async () => {
        await uploadSnapshot("INITIAL_HANDSHAKE");
        await sendFingerprint();
        onComplete({ cameraId: selectedCameraId || undefined, micId: selectedMicId || undefined });
    }, [onComplete, selectedCameraId, selectedMicId, uploadSnapshot, sendFingerprint]);
    // -----------------------------------------------------------------
    // MIC CHECK -- Web Speech API only, fully in-browser, no server call.
    // Passes the moment any speech is recognized -- not verifying words,
    // just confirming the mic is actually picking up voice.
    // ponytail: no phrase-matching, no audio upload/PCM conversion needed
    // now that Deepgram is gone -- upgrade to phrase-matching if false
    // positives (background noise) become a real problem.
    // -----------------------------------------------------------------
    const [isListening, setIsListening] = useState(false);
    const [speechApiSupported, setSpeechApiSupported] = useState(true);
    const startMicListening = useCallback(() => {
        const SpeechRecognitionCtor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) {
            setSpeechApiSupported(false);
            return;
        }
        if (recogRef.current) {
            try { recogRef.current.stop(); } catch { }
        }
        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0]?.transcript?.trim();
                if (transcript && transcript.length > 0) {
                    setMicVerified(true);
                    setIsListening(false);
                    try { recognition.stop(); } catch { }
                    break;
                }
            }
        };
        recognition.onerror = () => {
            setIsListening(false);
        };
        recognition.onend = () => {
            setIsListening(false);
        };
        recogRef.current = recognition;
        setIsListening(true);
        try { recognition.start(); } catch { setIsListening(false); }
    }, []);
    useEffect(() => () => {
        if (recogRef.current) { try { recogRef.current.stop(); } catch { } }
    }, []);
    // -----------------------------------------------------------------
    // NETWORK CHECK -- real round-trip ping against our own API, not decorative.
    // Runs once on mount and every 15s while the page is open so a connection
    // that degrades mid-check is caught before Begin is pressed.
    // ponytail: single fetch timing as the "ping" -- good enough signal, add
    // multi-sample jitter/packet-loss detection if false positives show up.
    // -----------------------------------------------------------------
    useEffect(() => {
        let cancelled = false;
        const ping = async () => {
            if (typeof navigator !== "undefined" && !navigator.onLine) {
                if (!cancelled) { setNetworkStatus("offline"); setNetworkLatencyMs(null); }
                return;
            }
            const start = performance.now();
            try {
                await fetch("/api/health", { method: "GET", cache: "no-store" });
                const elapsed = Math.round(performance.now() - start);
                if (cancelled) return;
                setNetworkLatencyMs(elapsed);
                setNetworkStatus(elapsed <= 800 ? "good" : "poor");
            } catch {
                if (!cancelled) { setNetworkStatus("offline"); setNetworkLatencyMs(null); }
            }
        };
        void ping();
        const interval = window.setInterval(ping, 15000);
        return () => { cancelled = true; window.clearInterval(interval); };
    }, []);
    // Volume level update (display only)
    useEffect(() => {
        if (micStatus !== "granted") return;
        const interval = setInterval(() => {
            const analyzer = analyzerRef.current;
            if (!analyzer) return;
            const td = new Uint8Array(analyzer.fftSize);
            analyzer.getByteTimeDomainData(td);
            let sumSq = 0;
            for (let i = 0; i < td.length; i++) {
                const v = (td[i] - 128) / 128;
                sumSq += v * v;
            }
            setMicVolumeLevel(Math.min(1, Math.sqrt(sumSq / td.length) * 20));
        }, 100);
        return () => clearInterval(interval);
    }, [micStatus]);
    //  Audio visualizer
    const startVisualizer = useCallback(() => {
        const tick = () => {
            // Always reschedule first so a missed analyzerRef never kills the loop
            animRef.current = requestAnimationFrame(tick);
            if (!analyzerRef.current) return;
            const analyzer = analyzerRef.current;
            analyzer.getByteFrequencyData(new Uint8Array(analyzer.frequencyBinCount));
        };
        animRef.current = requestAnimationFrame(tick);
    }, []);
    //  Speaker / Audio Playback Test
    const playSpeakerTest = useCallback(async () => {
        clearSpeakerFallbackTimer();
        setSpeakerStatus("playing");
        setSpeakerPlaying(true);
        setSpeakerRetryMsg(false);
        const word = SPEAKER_KEYWORDS[Math.floor(Math.random() * SPEAKER_KEYWORDS.length)];
        try {
            const synth = window.speechSynthesis;
            if (!synth) throw new Error("Speech synthesis not supported");
            // Cancel any ongoing speech
            synth.cancel();
            const promptTemplate = SPEAKER_PROMPTS[Math.floor(Math.random() * SPEAKER_PROMPTS.length)];
            const prompt = promptTemplate.replace("{word}", word);
            const utter = new SpeechSynthesisUtterance(prompt);
            const promptWords = prompt.trim().split(/\s+/).filter(Boolean).length;
            const fallbackMs = Math.max(4500, Math.min(6500, Math.round(promptWords * 280)));
            // Try to find a premium/natural sounding voice
            const voices = synth.getVoices();
            const preferredVoice = voices.find(v => (v.name.includes("Google") || v.name.includes("Natural")) && v.lang.startsWith("en"))
                || voices.find(v => v.lang.startsWith("en"))
                || voices[0];
            if (preferredVoice) utter.voice = preferredVoice;
            utter.rate = 0.95; // Slightly slower for better clarity
            utter.pitch = 1.0;
            utter.volume = 1.0; // Max browser-supported volume for speech synthesis
            utter.onstart = () => {
                setSpeakerPlaying(true);
            };
            utter.onend = () => {
                clearSpeakerFallbackTimer();
                setSpeakerPlaying(false);
                setSpeakerStatus("awaiting");
            };
            utter.onerror = (e) => {
                console.error("[Speaker] TTS error:", e);
                clearSpeakerFallbackTimer();
                setSpeakerPlaying(false);
                setSpeakerStatus("failed");
            };
            synth.speak(utter);
            // Safety fallback only if onend never fires.
            const tryUnlockAfterSpeech = () => {
                if (speakerStatusRef.current !== "playing") return;
                if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) {
                    speakerFallbackTimerRef.current = window.setTimeout(tryUnlockAfterSpeech, 350);
                    return;
                }
                setSpeakerPlaying(false);
                setSpeakerStatus("awaiting");
            };
            speakerFallbackTimerRef.current = window.setTimeout(tryUnlockAfterSpeech, fallbackMs);
        } catch (err) {
            console.error("[Speaker] Error:", err);
            clearSpeakerFallbackTimer();
            setSpeakerPlaying(false);
            setSpeakerStatus("failed");
        }
    }, [SPEAKER_KEYWORDS, clearSpeakerFallbackTimer]);
    const handleSpeakerFailure = () => {
        setSpeakerStatus("idle"); // Reset status back to idle so play button shows up again!
        setSpeakerRetryMsg(true);
    };
    const requestPermissions = useCallback(async (cameraId?: string, micId?: string) => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        setError(null);
        setCameraStatus("requesting");
        setMicStatus("requesting");
        setMicVerified(false);
        snapshotDoneRef.current = false;
        setSnapshotUrl(null);
        setSpeakerStatus("idle");
        setSpeakerPlaying(false);
        try {
            const constraints: MediaStreamConstraints = {
                video: cameraId
                    ? { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
                    : { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: micId ? { deviceId: { exact: micId } } : true,
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;
            const ds = await navigator.mediaDevices.enumerateDevices();
            setDevices(ds);
            const vTrack = stream.getVideoTracks()[0];
            const aTrack = stream.getAudioTracks()[0];
            if (vTrack && !cameraId) setSelectedCameraId(vTrack.getSettings().deviceId || '');
            if (aTrack && !micId) setSelectedMicId(aTrack.getSettings().deviceId || '');
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.muted = true;
                videoRef.current.volume = 0;
                videoRef.current.setAttribute('muted', '');
                const playVideo = async () => {
                    if (!videoRef.current) return;
                    try { await videoRef.current.play(); } catch { }
                };
                await playVideo();
                if (videoRef.current.paused) videoRef.current.onloadedmetadata = playVideo;
            }
            setCameraStatus("granted");
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioCtxRef.current = ctx;
            const unlockCtx = () => {
                if (ctx.state === 'suspended') ctx.resume().catch(() => { });
                document.removeEventListener('click', unlockCtx);
                document.removeEventListener('keydown', unlockCtx);
            };
            document.addEventListener('click', unlockCtx);
            document.addEventListener('keydown', unlockCtx);
            await ctx.resume().catch(() => { });
            const analyzer = ctx.createAnalyser();
            analyzer.fftSize = 512;
            const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
            micSourceRef.current = source;
            source.connect(analyzer);
            analyzerRef.current = analyzer;
            setMicStatus("granted");
            startVisualizer();
        } catch {
            setCameraStatus("denied");
            setMicStatus("denied");
            setError("Could not access camera or microphone. Please check browser permissions.");
        }
    }, [startVisualizer]);
    //  Global Mount Lifecycle
    useEffect(() => {
        requestPermissions();
        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
            audioCtxRef.current?.close();
            if (recogRef.current) try { recogRef.current.stop(); } catch { }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    if (!browserSupported) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl shadow-sm p-8 text-center">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Browser Not Supported</h2>
                    <p className="text-gray-500 text-sm mb-1">{browserName}</p>
                    <p className="text-gray-500 text-sm">Please use Google Chrome or Microsoft Edge on a desktop to continue.</p>
                </div>
            </div>
        );
    }
    const beginDisabled = !allReady || isStarting || snapshotUploading || !canBeginNow || isSlotLocked;
    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center p-6"
            style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFC 45%, #F5F3FF 100%)", backgroundAttachment: "fixed" }}
        >
            {/* Header: Environment Check with Dynamic Countdown Timer */}
            <div className="max-w-4xl w-full mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fadeIn text-left">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                        Environment Check
                    </h1>
                    <p className="text-sm text-gray-400 mt-0.5">Hi {candidateName} - let&apos;s make sure everything is set up before we begin.</p>
                </div>
                <div className="flex-shrink-0">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-full px-4 py-2 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Live &amp; Ready to Begin
                    </div>
                </div>
            </div>
            {/* Outer Grid: Camera left, all checks stacked right -- single page, no steps */}
            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-5 animate-fadeIn items-start">
                {/* Left Card: Live Camera Monitor */}
                <div className="bg-white rounded-2xl flex flex-col justify-between overflow-hidden" style={{ border: "1px solid #E9E7FF", boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}>
                    <div className="p-5 pb-2">
                        <h2 className="text-sm font-semibold text-gray-900 mb-3">
                            Live Camera Monitor
                        </h2>
                        {/* Video Frame */}
                        <div className="relative aspect-[4/3] rounded-xl overflow-hidden" style={{ border: "1px solid #F0EEF8", background: "#F9FAFB" }}>
                            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                            {cameraStatus !== "granted" && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-50 text-gray-400">
                                    <Camera className="w-8 h-8 text-gray-300 animate-pulse" />
                                    <span className="text-xs font-medium">
                                        {cameraStatus === "requesting" ? "Requesting access..." : "Camera offline"}
                                    </span>
                                </div>
                            )}
                            {snapshotUploading && (
                                <div className="absolute top-3 right-3 bg-gray-900/60 backdrop-blur-md text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Uploading snapshot...
                                </div>
                            )}
                        </div>
                        {/* Simple Functional Checkboxes */}
                        <div className="flex items-center justify-center gap-6 mt-3 pb-2">
                            <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
                                <span className={cn(
                                    "w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-semibold transition-all duration-300",
                                    faceCountHistoryRef.current.filter(c => c === 1).length >= 3 ? "bg-emerald-500" : "bg-gray-200 text-gray-400"
                                )}>
                                    ✓
                                </span>
                                <span>Face Detected</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
                                <span className={cn(
                                    "w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-semibold transition-all duration-300",
                                    visualSignals.lighting ? "bg-emerald-500" : "bg-gray-200 text-gray-400"
                                )}>
                                    ✓
                                </span>
                                <span>Optimal Lighting</span>
                            </div>
                        </div>
                    </div>
                    {/* Dynamic Diagnostic Recommendation Banner */}
                    <div className={cn(
                        "px-5 py-3 text-xs font-semibold text-center transition-all duration-300",
                        cameraStatus !== "granted"
                            ? "bg-gray-50 text-gray-400"
                            : !cameraFullyReady && faceCountHistoryRef.current.filter(c => c === 1).length < 3
                                ? "bg-red-50 text-red-600"
                                : cameraFullyReady
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-violet-50 text-violet-600"
                    )} style={{ borderTop: "1px solid #F0EEF8" }}>
                        {cameraStatus !== "granted" ? (
                            <span>Camera Access Required</span>
                        ) : !cameraFullyReady && faceCountHistoryRef.current.filter(c => c === 1).length < 3 ? (
                            <span>No face detected. Please center your face.</span>
                        ) : cameraFullyReady ? (
                            <span>Camera Secured &amp; Ready</span>
                        ) : (
                            <span>{visualStatusMsg}</span>
                        )}
                    </div>
                </div>
                {/* Right Column: Mic / Speaker / Network / Consent boxes -- no steps */}
                <div className="flex flex-col gap-3.5">
                    {/* Microphone Box -- red border until verified, green after */}
                    <div
                        className="bg-white rounded-2xl p-4 transition-colors duration-300"
                        style={{ border: `1.5px solid ${micVerified ? "#A7F3D0" : "#FECACA"}`, boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}
                    >
                        <div className="flex items-center justify-between mb-2.5">
                            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                <Mic className="w-3.5 h-3.5 text-gray-400" /> Microphone
                            </h3>
                            {micVerified ? (
                                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                                </span>
                            ) : (
                                <span className="text-xs font-semibold text-red-500">Not Verified</span>
                            )}
                        </div>
                        {!speechApiSupported ? (
                            <p className="text-xs text-red-500">Speech detection isn&apos;t supported in this browser. Please use Chrome or Edge.</p>
                        ) : micVerified ? (
                            <p className="text-xs text-emerald-600">We heard you clearly - your microphone is working.</p>
                        ) : (
                            <div className="flex flex-col gap-2.5">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <motion.div
                                            className={cn(
                                                "h-full rounded-full",
                                                micVolumeLevel > 0.4 ? "bg-emerald-500" : micVolumeLevel > 0.1 ? "bg-violet-400" : "bg-gray-300"
                                            )}
                                            animate={{ width: `${Math.max(2, micVolumeLevel * 100)}%` }}
                                            transition={{ duration: 0.08 }}
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={startMicListening}
                                    disabled={isListening || micStatus !== "granted"}
                                    className="btn-shimmer inline-flex items-center gap-1.5 h-8 px-4 rounded-xl text-xs font-medium text-white transition-all disabled:opacity-50 w-fit"
                                    style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                                >
                                    {isListening ? (
                                        <><span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> Listening... say anything</>
                                    ) : (
                                        <><Mic className="w-3 h-3" /> Test Microphone</>
                                    )}
                                </button>
                            </div>
                        )}
                        {/* Mic source selector */}
                        {devices.filter(d => d.kind === "audioinput").length > 1 && (
                            <div className="relative mt-2.5" ref={micDropdownRef}>
                                <button
                                    onClick={() => setIsMicDropdownOpen(v => !v)}
                                    className="w-full flex items-center justify-between text-xs bg-gray-50 rounded-xl px-3 py-2 text-gray-600 hover:bg-gray-100 transition-colors font-medium"
                                    style={{ border: "1px solid #E9E7FF" }}
                                >
                                    <span className="truncate">{devices.find(d => d.kind === "audioinput" && d.deviceId === selectedMicId)?.label || "Choose microphone"}</span>
                                    <ChevronDown className="w-3.5 h-3.5 ml-2 flex-shrink-0" />
                                </button>
                                <AnimatePresence>
                                    {isMicDropdownOpen && (
                                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                                            className="absolute z-20 top-full mt-1 w-full bg-white rounded-xl shadow-lg overflow-hidden max-h-36 overflow-y-auto"
                                            style={{ border: "1px solid #E9E7FF" }}>
                                            {devices.filter(d => d.kind === "audioinput").map(d => (
                                                <button key={d.deviceId} onClick={() => { setSelectedMicId(d.deviceId); setIsMicDropdownOpen(false); }}
                                                    className={cn("w-full text-left text-xs px-3 py-2 hover:bg-violet-50 transition-colors font-medium", d.deviceId === selectedMicId && "bg-violet-50 text-violet-600")}>
                                                    {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                    {/* Speaker Box -- red border until passed, green after */}
                    <div
                        className="bg-white rounded-2xl p-4 transition-colors duration-300"
                        style={{ border: `1.5px solid ${speakerStatus === "passed" ? "#A7F3D0" : "#FECACA"}`, boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}
                    >
                        <div className="flex items-center justify-between mb-2.5">
                            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                <Volume2 className="w-3.5 h-3.5 text-gray-400" /> Speakers
                            </h3>
                            {speakerStatus === "passed" ? (
                                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                                </span>
                            ) : (
                                <span className="text-xs font-semibold text-red-500">Not Verified</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <AnimatePresence mode="wait">
                                {speakerStatus === "idle" || speakerStatus === "failed" ? (
                                    <motion.button
                                        key="play-btn"
                                        onClick={playSpeakerTest}
                                        className="w-9 h-9 rounded-full text-white flex items-center justify-center transition-all flex-shrink-0"
                                        style={{ background: "linear-gradient(135deg, #8B5CF6, #3B82F6)", boxShadow: "0 4px 12px rgba(124,58,237,0.25)" }}
                                    >
                                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                    </motion.button>
                                ) : speakerStatus === "playing" ? (
                                    <motion.div key="playing-pulse" className="flex items-center gap-1.5 h-9 flex-shrink-0">
                                        {[1, 2, 3, 4].map(i => (
                                            <motion.div
                                                key={i}
                                                animate={{ scaleY: [1, 1.8, 1], opacity: [0.4, 1, 0.4] }}
                                                transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                                                className="w-1 h-4 bg-violet-500 rounded-full"
                                            />
                                        ))}
                                    </motion.div>
                                ) : speakerStatus === "awaiting" ? (
                                    <motion.div key="awaiting-badge" className="w-9 h-9 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0" style={{ border: "1px solid #E9E7FF" }}>
                                        <Volume2 className="w-4 h-4" />
                                    </motion.div>
                                ) : speakerStatus === "passed" ? (
                                    <motion.div key="passed-badge" className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="w-4 h-4" />
                                    </motion.div>
                                ) : null}
                            </AnimatePresence>
                            <div className="flex-1">
                                {speakerStatus === "awaiting" ? (
                                    <div className="flex flex-col gap-1.5">
                                        <p className="text-[11px] font-semibold text-violet-600">Did you hear it?</p>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => { setSpeakerStatus("passed"); setSpeakerRetryMsg(false); }}
                                                className="rounded-xl px-3 py-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all"
                                                style={{ border: "1px solid #A7F3D0" }}
                                            >
                                                Yes, I heard it
                                            </button>
                                            <button
                                                onClick={handleSpeakerFailure}
                                                className="rounded-xl px-3 py-1.5 text-[11px] font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-all"
                                                style={{ border: "1px solid #FECACA" }}
                                            >
                                                No sound
                                            </button>
                                        </div>
                                    </div>
                                ) : speakerStatus === "passed" ? (
                                    <p className="text-xs text-emerald-600">Audio output confirmed working.</p>
                                ) : speakerRetryMsg ? (
                                    <p className="text-xs text-red-500">No sound? Check your volume and try again.</p>
                                ) : (
                                    <p className="text-xs text-gray-400">Click play to verify your speakers.</p>
                                )}
                            </div>
                        </div>
                    </div>
                    {/* Network Box -- real round-trip ping, red/green like the others */}
                    <div
                        className="bg-white rounded-2xl p-4 transition-colors duration-300"
                        style={{ border: `1.5px solid ${networkStatus === "good" ? "#A7F3D0" : networkStatus === "checking" ? "#E9E7FF" : "#FECACA"}`, boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}
                    >
                        <div className="flex items-center justify-between mb-2.5">
                            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                <Wifi className="w-3.5 h-3.5 text-gray-400" /> Network
                            </h3>
                            {networkStatus === "good" ? (
                                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Good connection
                                </span>
                            ) : networkStatus === "checking" ? (
                                <span className="text-xs font-semibold text-gray-400">Checking...</span>
                            ) : networkStatus === "poor" ? (
                                <span className="text-xs font-semibold text-red-500">Slow connection</span>
                            ) : (
                                <span className="text-xs font-semibold text-red-500">Offline</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-end gap-[3px] h-[18px] flex-shrink-0">
                                {[30, 55, 75, 100].map((h, i) => (
                                    <div key={i} className={cn(
                                        "w-[4px] rounded-sm",
                                        networkStatus === "good" ? "bg-emerald-500" : networkStatus === "poor" ? "bg-red-400" : "bg-gray-200"
                                    )} style={{ height: `${h}%` }} />
                                ))}
                            </div>
                            <p className="text-xs text-gray-400 flex-1">
                                {networkStatus === "checking" && "Measuring your connection..."}
                                {networkStatus === "good" && (
                                    <>Connection is stable. <span className="font-semibold text-emerald-600 tabular-nums">{networkLatencyMs}ms</span></>
                                )}
                                {networkStatus === "poor" && (
                                    <>Connection is slow, video may lag. <span className="font-semibold text-red-500 tabular-nums">{networkLatencyMs}ms</span></>
                                )}
                                {networkStatus === "offline" && "No internet connection detected."}
                            </p>
                        </div>
                    </div>
                    {/* Consent Box */}
                    <div
                        className="bg-white rounded-2xl p-4 transition-colors duration-300"
                        style={{ border: `1.5px solid ${consentChecked ? "#A7F3D0" : "#FECACA"}`, boxShadow: "0 1px 3px rgba(124,58,237,0.04)" }}
                    >
                        <div className="flex items-center justify-between mb-2.5">
                            <h3 className="text-sm font-semibold text-gray-900">Consent</h3>
                            {consentChecked ? (
                                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Agreed
                                </span>
                            ) : (
                                <span className="text-xs font-semibold text-red-500">Required</span>
                            )}
                        </div>
                        <label className="group flex items-start gap-2.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={consentChecked}
                                onChange={(e) => setConsentChecked(e.target.checked)}
                                className="h-4 w-4 mt-0.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer flex-shrink-0"
                            />
                            <span className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-800 transition-colors">
                                I agree and consent to capture dynamic photos during this interview session to verify my profile and ensure integrity.
                            </span>
                        </label>
                    </div>
                </div>
                {/* Begin CTA -- own row, spans both columns, bottom of the whole layout */}
                <div className="md:col-span-2 flex flex-col items-center gap-1.5 mt-1">
                    <button
                        onClick={handleBeginInterview}
                        disabled={beginDisabled}
                        className={cn(
                            "btn-shimmer inline-flex items-center justify-center gap-2 h-12 w-full rounded-xl text-sm font-medium transition-all tabular-nums",
                            !isSlotLocked && !beginDisabled
                                ? "text-white"
                                : "bg-white text-gray-400"
                        )}
                        style={
                            !isSlotLocked && !beginDisabled
                                ? { background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" }
                                : { border: "1.5px solid #E9E7FF" }
                        }
                    >
                        {isStarting || snapshotUploading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Securing...</>
                        ) : isSlotLocked && slotCountdownSecs !== null ? (
                            <>Interview opens in {String(Math.floor(slotCountdownSecs / 60)).padStart(2, "0")}:{String(slotCountdownSecs % 60).padStart(2, "0")}</>
                        ) : (
                            <><Zap className="w-4 h-4" /> Begin Interview</>
                        )}
                    </button>
                </div>
            </div>
            {/* Terms & Policy Footer */}
            <p className="text-xs text-gray-400 text-center leading-relaxed mt-5 max-w-3xl animate-fadeIn px-4">
                By proceeding, you agree to our{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline font-medium">
                    Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline font-medium">
                    Privacy Policy
                </a>
                . This session will be recorded and monitored for quality and verification purposes.
            </p>
        </div>
    );
}
