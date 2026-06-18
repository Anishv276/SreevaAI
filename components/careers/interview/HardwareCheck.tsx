"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Mic, CheckCircle2, AlertCircle, Loader2, RefreshCw, Volume2, ChevronDown, Zap, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
// Short, natural lines that feel less robotic while staying easy to verify.
const VERIFICATION_SENTENCES = [
    "I am ready for a great interview today",
    "Hello, I am here and ready to begin",
    "My microphone sounds clear and crisp",
    "I can speak clearly and confidently today",
    "Please verify that my microphone is working",
    "I build things that save people time",
    "I like turning messy work into simple workflows",
    "Today feels like a good day to get started",
    "I bring calm energy and clear communication",
    "This setup is looking smooth and ready",
    "I enjoy solving problems one step at a time",
    "Let us make this interview a good conversation",
];
const SPEAKER_PROMPTS = [
    "Quick sound check for us today: when you hear {word}, click Yes.",
    "Let's make sure the room sounds good. When you hear {word}, tap Yes.",
    "One last audio check: I will say {word} in a moment. Hear it and click Yes.",
    "Just a quick speaker test. When you catch the word {word}, press Yes.",
    "We are almost there. When you hear {word}, go ahead and click Yes.",
    "Tiny audio check before we begin: listen for {word}, then click Yes.",
    "Let us confirm the speakers are lively. When you hear {word}, click Yes.",
    "A quick volume check: once you hear {word}, just hit Yes.",
];
interface HardwareCheckProps {
    onComplete: (devices?: { cameraId?: string; micId?: string }) => void | Promise<void>;
    onRetry?: () => void;
    isStarting?: boolean;
    errorMessage?: string | null;
    candidateName?: string;
    applicationId?: string;
    interviewToken?: string;
    title?: string;
}
type CheckStatus = "idle" | "requesting" | "granted" | "denied";
type WindowWithWebkitAudioContext = Window & {
    webkitAudioContext?: typeof AudioContext;
};
const FLUX_VERIFY_SAMPLE_RATE = 16000;
const FLUX_VERIFY_FETCH_TIMEOUT_MS = 22000;
async function recordedAudioToLinear16Pcm(chunks: Blob[], mimeType: string): Promise<Blob> {
    const sourceBlob = new Blob(chunks, { type: mimeType || "audio/webm" });
    const sourceBuffer = await sourceBlob.arrayBuffer();
    const AudioContextCtor = window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
    if (!AudioContextCtor) {
        throw new Error("AudioContext is not available");
    }
    const audioContext = new AudioContextCtor();
    try {
        const decoded = await audioContext.decodeAudioData(sourceBuffer.slice(0));
        let buffer = decoded;
        if (decoded.sampleRate !== FLUX_VERIFY_SAMPLE_RATE || decoded.numberOfChannels !== 1) {
            const frameCount = Math.max(1, Math.ceil(decoded.duration * FLUX_VERIFY_SAMPLE_RATE));
            const offlineContext = new OfflineAudioContext(1, frameCount, FLUX_VERIFY_SAMPLE_RATE);
            const source = offlineContext.createBufferSource();
            source.buffer = decoded;
            source.connect(offlineContext.destination);
            source.start(0);
            buffer = await offlineContext.startRendering();
        }
        const channel = buffer.getChannelData(0);
        // --- Trim leading silence / noise ---
        // Scan in 50ms windows. Find the first window where RMS exceeds a speech
        // threshold, then start from 100ms before that point so we don't clip
        // the first syllable. This removes repeated filler like "two two two"
        // captured before the user starts reading the actual sentence.
        const windowSamples = Math.floor(FLUX_VERIFY_SAMPLE_RATE * 0.05); // 50ms
        const SPEECH_RMS_THRESHOLD = 0.015; // tune: lower = more sensitive
        let speechStartSample = 0;
        for (let i = 0; i < channel.length - windowSamples; i += windowSamples) {
            let sumSq = 0;
            for (let j = i; j < i + windowSamples; j++) sumSq += channel[j] * channel[j];
            const rms = Math.sqrt(sumSq / windowSamples);
            if (rms > SPEECH_RMS_THRESHOLD) {
                // Go back 100ms as a safety buffer so we don't cut the first phoneme
                speechStartSample = Math.max(0, i - Math.floor(FLUX_VERIFY_SAMPLE_RATE * 0.1));
                break;
            }
        }
        const trimmedChannel = speechStartSample > 0 ? channel.slice(speechStartSample) : channel;
        const pcm = new ArrayBuffer(trimmedChannel.length * 2);
        const view = new DataView(pcm);
        for (let i = 0; i < trimmedChannel.length; i++) {
            const sample = Math.max(-1, Math.min(1, trimmedChannel[i]));
            view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        }
        return new Blob([pcm], { type: "application/octet-stream" });
    } finally {
        await audioContext.close().catch(() => undefined);
    }
}
export function HardwareCheck({
    onComplete,
    onRetry,
    isStarting = false,
    errorMessage = null,
    candidateName = "candidate",
    applicationId = "unknown",
    interviewToken = "",
    title = "Environment Check",
}: HardwareCheckProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const animRef = useRef<number | null>(null);
    const recogRef = useRef<any>(null);
    const verifiedRef = useRef(false);
    const verifiedPhraseRef = useRef(""); // Always holds latest phrase - avoids stale closure in speech effect
    const snapshotDoneRef = useRef(false);
    const lastNoiseUpdateTimeRef = useRef(0);
    const smoothDbRef = useRef<number | null>(null);
    const noiseHistoryRef = useRef<number[]>([]);
    const sessionFinalTextRef = useRef("");
    const liveTranscriptRef = useRef(""); // Always fresh, avoids stale closure in sendToDeepgram
    const faceCountHistoryRef = useRef<number[]>([]); // 5-frame buffer for temporal consensus
    const [cameraStatus, setCameraStatus] = useState<CheckStatus>("idle");
    const [micStatus, setMicStatus] = useState<CheckStatus>("idle");
    const [activeStep, setActiveStep] = useState(0);
    const [frequencies, setFrequencies] = useState<number[]>(new Array(40).fill(0));
    const [error, setError] = useState<string | null>(null);
    const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
    const [snapshotUploading, setSnapshotUploading] = useState(false);
    const [consentChecked, setConsentChecked] = useState(false);
    // Live transcript from speech recognition
    const [liveTranscript, setLiveTranscript] = useState("");
    const [micRetryToken, setMicRetryToken] = useState(0);
    // Live mic volume level for visual feedback (0-1)
    const [micVolumeLevel, setMicVolumeLevel] = useState(0);
    // Pick a default sentence on mount - initialized instantly to prevent blank render frames
    const [verifiedPhrase, setVerifiedPhrase] = useState(() => {
        const sentence = VERIFICATION_SENTENCES[Math.floor(Math.random() * VERIFICATION_SENTENCES.length)];
        verifiedPhraseRef.current = sentence;
        return sentence;
    });
    // Keep ref in sync with state so useCallback closures always read the current phrase
    useEffect(() => { verifiedPhraseRef.current = verifiedPhrase; }, [verifiedPhrase]);
    const [canBeginNow, setCanBeginNow] = useState(false);
    useEffect(() => {
        setCanBeginNow(true);
    }, []);
    // Device Selection
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [selectedMicId, setSelectedMicId] = useState('');
    const [isCamDropdownOpen, setIsCamDropdownOpen] = useState(false);
    const [isMicDropdownOpen, setIsMicDropdownOpen] = useState(false);
    const refreshPhrase = useCallback(() => {
        const remaining = VERIFICATION_SENTENCES.filter(s => s !== verifiedPhrase);
        const next = remaining[Math.floor(Math.random() * remaining.length)] || VERIFICATION_SENTENCES[0];
        verifiedPhraseRef.current = next;
        setVerifiedPhrase(next);
        setMicVerified(false);
        verifiedRef.current = false;
        sessionFinalTextRef.current = "";
        liveTranscriptRef.current = "";
        setLiveTranscript("");
        setMicRetryToken(t => t + 1);
    }, [verifiedPhrase]);
    const retryMic = useCallback(() => {
        clearMicTimers();
        autoVerifyInProgressRef.current = false;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            try { mediaRecorderRef.current.stop(); } catch { }
        }
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        setIsRecording(false);
        setIsVerifying(false);
        setMicVerified(false);
        verifiedRef.current = false;
        sessionFinalTextRef.current = "";
        liveTranscriptRef.current = "";
        setLiveTranscript("");
        setMicRetryToken(t => t + 1);
    }, [clearMicTimers]);
    const camDropdownRef = useRef<HTMLDivElement>(null);
    const micDropdownRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (camDropdownRef.current && !camDropdownRef.current.contains(event.target as Node)) {
                setIsCamDropdownOpen(false);
            }
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
    const [speakerTargetWord, setSpeakerTargetWord] = useState("");
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
        alignment: false,
        proximity: false,
        lighting: false,
    });
    const [visualStatusMsg, setVisualStatusMsg] = useState("Initializing visual integrity check...");
    const faceLocked = faceCountHistoryRef.current.filter(c => c === 1).length >= 3;
    const visualReady = visualSignals.alignment && visualSignals.proximity && visualSignals.lighting;
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
                // Thresholds matching FaceProctoring
                const CENTER_X_MIN = 0.35, CENTER_X_MAX = 0.65;
                const CENTER_Y_MIN = 0.25, CENTER_Y_MAX = 0.55;
                const PROX_MIN = 0.20, PROX_MAX = 0.55;
                const LIGHT_MIN = 70, LIGHT_MAX = 200;
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
                    // -- Signal 03: Identity Lock (Temporal Consensus 3/5) --
                    // We require exactly 1 face for stability.
                    faceCountHistoryRef.current.push(numFaces);
                    if (faceCountHistoryRef.current.length > 5) faceCountHistoryRef.current.shift();
                    const validFrames = faceCountHistoryRef.current.filter(c => c === 1).length;
                    const isIdentityLocked = validFrames >= 3;
                    if (!isIdentityLocked || numFaces !== 1) {
                        setVisualSignals({ alignment: false, proximity: false, lighting: lastLightGood });
                        if (numFaces === 0) setVisualStatusMsg("No face detected. Please look at the camera.");
                        else if (numFaces > 1) setVisualStatusMsg("Multiple faces detected. Please ensure you are alone.");
                        else setVisualStatusMsg("Stabilizing visual identity...");
                        return;
                    }
                    // -- Defensive Check: Ensure landmarks exist and are an array --
                    const landmarks = result.faceLandmarks[0];
                    if (!landmarks || !Array.isArray(landmarks) || landmarks.length === 0) {
                        setVisualSignals({ alignment: false, proximity: false, lighting: lastLightGood });
                        return;
                    }
                    // Use numeric filtering to be 100% safe
                    const xs = landmarks.filter(l => l && typeof l.x === 'number').map(l => l.x);
                    const ys = landmarks.filter(l => l && typeof l.y === 'number').map(l => l.y);
                    if (xs.length === 0 || ys.length === 0) return;
                    const minX = Math.min(...xs), maxX = Math.max(...xs);
                    const minY = Math.min(...ys), maxY = Math.max(...ys);
                    const cx = (minX + maxX) / 2;
                    const cy = (minY + maxY) / 2;
                    // -- Signal 04: Focus Centering (0.35–0.65 / 0.25–0.55) --
                    const isAligned = cx >= 0.35 && cx <= 0.65 && cy >= 0.25 && cy <= 0.55;
                    // -- Signal 05: Proximity / Scale (0.20–0.55) --
                    const widthRatio = maxX - minX;
                    const isProxGood = widthRatio >= 0.20 && widthRatio <= 0.55;
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
                                // -- Signal 06: Lighting Quality (70–200) --
                                lastLightGood = brightness >= 70 && brightness <= 200;
                            }
                        } catch (e) { }
                    }
                    setVisualSignals({ alignment: isAligned, proximity: isProxGood, lighting: lastLightGood });
                    const errors: string[] = [];
                    if (!isAligned) errors.push(cx < 0.35 ? "Move right" : cx > 0.65 ? "Move left" : "Center face");
                    if (!isProxGood) errors.push(widthRatio < 0.20 ? "Move closer" : "Move further back");
                    if (!lastLightGood) errors.push("Lighting is poor");
                    if (errors.length > 0) {
                        setVisualStatusMsg(errors.join(" | "));
                    } else {
                        setVisualStatusMsg("Face detected");
                    }
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
    const cameraFullyReady = cameraStatus === "granted" && faceLocked && visualReady;
    const allReady = cameraFullyReady &&
        micStatus === "granted" &&
        micVerified &&
        (speakerStatus === "passed" || speakerStatus === "failed") &&
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
    const handleBeginInterview = useCallback(async () => {
        // Trigger the handshake snapshot. 
        // We MUST await this to ensure the database record is created 
        // before the component unmounts (changing the phase).
        await uploadSnapshot("INITIAL_HANDSHAKE");
        onComplete({ cameraId: selectedCameraId || undefined, micId: selectedMicId || undefined });
    }, [onComplete, selectedCameraId, selectedMicId, uploadSnapshot]);
    // -----------------------------------------------------------------
    // SPEECH RECOGNITION
    // Strategy: MediaRecorder captures audio -> Deepgram Flux transcribes
    // Web Speech API used only for live "Heard:" display (not for pass/fail)
    // -----------------------------------------------------------------
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const micSilenceTimerRef = useRef<number | null>(null);
    const micMaxTimerRef = useRef<number | null>(null);
    const autoVerifyInProgressRef = useRef(false);
    const sendToDeepgramRef = useRef<((chunks: Blob[], mimeType: string) => void) | null>(null);
    function clearMicTimers() {
        if (micSilenceTimerRef.current !== null) {
            window.clearTimeout(micSilenceTimerRef.current);
            micSilenceTimerRef.current = null;
        }
        if (micMaxTimerRef.current !== null) {
            window.clearTimeout(micMaxTimerRef.current);
            micMaxTimerRef.current = null;
        }
    }
    useEffect(() => () => {
        clearMicTimers();
    }, []);
    function autoStopAndVerify() {
        const mr = mediaRecorderRef.current;
        if (!mr || autoVerifyInProgressRef.current) return;
        autoVerifyInProgressRef.current = true;
        clearMicTimers();
        setIsRecording(false);
        const finish = () => {
            sendToDeepgramRef.current?.(audioChunksRef.current, mr.mimeType);
        };
        if (mr.state === "inactive") {
            finish();
            return;
        }
        mr.onstop = finish;
        try {
            mr.stop();
        } catch (err) {
            console.error("[Record] auto-stop error:", err);
            autoVerifyInProgressRef.current = false;
            setIsVerifying(false);
        }
    }
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
    // Web Speech API has been removed to rely exclusively on Deepgram for verification.
    // Start recording audio via MediaRecorder
    const startRecording = useCallback(() => {
        // Stop any existing recorder first
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            try { mediaRecorderRef.current.stop(); } catch { }
        }
        clearMicTimers();
        autoVerifyInProgressRef.current = false;
        const stream = streamRef.current;
        if (!stream) return;
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) return;
        const audioStream = new MediaStream(audioTracks);
        const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", ""]
            .find(m => m === "" || MediaRecorder.isTypeSupported(m)) ?? "";
        audioChunksRef.current = [];
        sessionFinalTextRef.current = "";
        liveTranscriptRef.current = "";
        setLiveTranscript("");
        const mr = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
        mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        mediaRecorderRef.current = mr;
        mr.onstart = () => {
            setIsRecording(true);
            micMaxTimerRef.current = window.setTimeout(() => {
                void autoStopAndVerify();
            }, 12000);
        };
        mr.onerror = () => {
            clearMicTimers();
            autoVerifyInProgressRef.current = false;
            setIsRecording(false);
        };
        mr.start(250);
    }, [autoStopAndVerify, clearMicTimers]);
    // Verify the mic check. Strategy:
    //   1. If Web Speech API already captured a transcript → check it immediately (zero network latency).
    //   2. Only call Deepgram if Web Speech gave nothing (e.g. browser blocked Web Speech, no mic data).
    const sendToDeepgram = useCallback(async (chunks: Blob[], mimeType: string) => {
        setIsVerifying(true);
        let timeoutId: number | null = null;
        // Read from refs — never stale inside useCallback
        const wsTranScript = liveTranscriptRef.current.trim() || sessionFinalTextRef.current.trim();
        const expand = (s: string) => s
            .replace(/i'm/gi, "i am").replace(/i've/gi, "i have").replace(/i'll/gi, "i will")
            .replace(/it's/gi, "it is").replace(/that's/gi, "that is").replace(/\bm\b/gi, "am");
        const norm = (s: string) => expand(s).toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
        const checkMatch = (transcript: string) => {
            const spokenNorm = norm(transcript);
            const targetNorm = norm(verifiedPhraseRef.current);
            const targetWords = targetNorm.split(" ").filter(Boolean);
            const spokenWords = new Set(spokenNorm.split(" ").filter(Boolean));
            const matchedCount = targetWords.filter(w => spokenWords.has(w)).length;
            return matchedCount >= Math.ceil(targetWords.length * 0.8);
        };
        // --- Deepgram Verification ---
        try {
            const audioBlob = await recordedAudioToLinear16Pcm(chunks, mimeType);
            const formData = new FormData();
            formData.append("audio", audioBlob, "mic-check-linear16.pcm");
            formData.append("targetPhrase", verifiedPhraseRef.current);
            formData.append("applicationId", applicationId);
            formData.append("interviewToken", interviewToken);
            const controller = new AbortController();
            timeoutId = window.setTimeout(() => controller.abort(), FLUX_VERIFY_FETCH_TIMEOUT_MS);
            const res = await fetch("/api/verify-speech", {
                method: "POST",
                body: formData,
                signal: controller.signal,
            });
            const data = await res.json();
            const deepgramTranscript = data.transcript as string;
            if (deepgramTranscript) {
                setLiveTranscript(deepgramTranscript);
                if (data.matched) {
                    verifiedRef.current = true;
                    setMicVerified(true);
                }
            }
        } catch (err) {
            console.error("[verify-speech]", err);
            // Deepgram also failed — mic check simply doesn't verify; user sees retry prompt
        } finally {
            if (timeoutId !== null) window.clearTimeout(timeoutId);
            setIsVerifying(false);
            clearMicTimers();
            autoVerifyInProgressRef.current = false;
            setIsRecording(false);
        }
    }, [applicationId, clearMicTimers, interviewToken]);
    useEffect(() => {
        sendToDeepgramRef.current = sendToDeepgram;
    }, [sendToDeepgram]);
    // Stop recording and trigger verification
    const stopAndVerify = useCallback(() => {
        const mr = mediaRecorderRef.current;
        if (!mr) return;
        setIsRecording(false);
        if (mr.state === "inactive") {
            // Already stopped — use whatever chunks we have
            sendToDeepgram(audioChunksRef.current, mr.mimeType);
            return;
        }
        mr.onstop = () => sendToDeepgram(audioChunksRef.current, mr.mimeType);
        try { mr.stop(); } catch (err) { console.error("[Record] stop error:", err); setIsVerifying(false); }
    }, [sendToDeepgram]);
    //  Audio visualizer
    const startVisualizer = useCallback(() => {
        const tick = () => {
            // Always reschedule first so a missed analyzerRef never kills the loop
            animRef.current = requestAnimationFrame(tick);
            if (!analyzerRef.current) return;
            const analyzer = analyzerRef.current;
            // Frequency data for waveform bars
            const freqData = new Uint8Array(analyzer.frequencyBinCount);
            analyzer.getByteFrequencyData(freqData);
            const bars = 40;
            const binSize = Math.floor(freqData.length / bars);
            setFrequencies(Array.from({ length: bars }, (_, i) => {
                let sum = 0;
                for (let j = 0; j < binSize; j++) sum += freqData[i * binSize + j];
                return sum / binSize / 255;
            }));
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
        setSpeakerTargetWord(word);
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
            // We keep polling until the browser reports speech is no longer active,
            // which avoids showing Yes/No while audio is still being spoken.
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
        clearMicTimers();
        autoVerifyInProgressRef.current = false;
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        setError(null);
        setCameraStatus("requesting");
        setMicStatus("requesting");
        setMicVerified(false);
        setActiveStep(0);
        verifiedRef.current = false;
        snapshotDoneRef.current = false;
        setSnapshotUrl(null);
        setSpeakerStatus("idle");
        setSpeakerPlaying(false);
        setLiveTranscript("");
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
    }, [clearMicTimers, startVisualizer]);
    //  Global Mount Lifecycle
    useEffect(() => {
        requestPermissions();
        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
            audioCtxRef.current?.close();
            if (recogRef.current) try { recogRef.current.abort(); } catch { }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    //  Readiness score for progress bar
    const checks = [
        cameraStatus === "granted",
        micStatus === "granted" && micVerified,
        speakerStatus === "passed" || speakerStatus === "failed",
        visualReady,
    ];
    const readyCount = checks.filter(Boolean).length;
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
    return (
        <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-6 font-sans">
            {/* Header: Environment Check with Dynamic Countdown Timer */}
            <div className="max-w-4xl w-full mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fadeIn text-left">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                        Environment Check
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">Hi {candidateName} - let&apos;s make sure everything is set up before we begin.</p>
                </div>
                <div className="flex-shrink-0">
                    <div className="bg-green-50 border border-green-100 rounded-full px-4 py-2 flex items-center gap-2 text-xs font-bold text-green-700 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        Live &amp; Ready to Begin
                    </div>
                </div>
            </div>
            {/* Super Clean Outer Container Grid (Match 2nd Pic Exactly) */}
            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                {/* Left Card: Live Camera Monitor with Dynamic Dynamic Recommendation Banner */}
                <div className="bg-white rounded-[28px] shadow-sm border border-gray-100 flex flex-col justify-between overflow-hidden">
                    <div className="p-6 pb-2">
                        <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-4">
                            Live Camera Monitor
                        </h2>
                        {/* Video Frame */}
                        <div className="relative aspect-[4/3] bg-gray-50 rounded-[20px] overflow-hidden border border-gray-100/50 shadow-inner">
                            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                            {cameraStatus !== "granted" && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-100 text-gray-400">
                                    <Camera className="w-8 h-8 text-gray-300 animate-pulse" />
                                    <span className="text-xs font-semibold">
                                        {cameraStatus === "requesting" ? "Requesting access..." : "Camera offline"}
                                    </span>
                                </div>
                            )}
                            {snapshotUploading && (
                                <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin text-orange-500" /> Uploading snapshot...
                                </div>
                            )}
                        </div>
                        {/* Simple Functional Checkboxes (Matching 2nd Pic) */}
                        <div className="flex items-center justify-center gap-6 mt-4 pb-2">
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                                <span className={cn(
                                    "w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold transition-all duration-300",
                                    faceCountHistoryRef.current.filter(c => c === 1).length >= 3 ? "bg-[#34c759]" : "bg-gray-200 text-gray-400"
                                )}>
                                    ✓
                                </span>
                                <span>Face Detected</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                                <span className={cn(
                                    "w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold transition-all duration-300",
                                    visualSignals.lighting ? "bg-[#34c759]" : "bg-gray-200 text-gray-400"
                                )}>
                                    ✓
                                </span>
                                <span>Optimal Lighting</span>
                            </div>
                        </div>
                    </div>
                    {/* Dynamic Diagnostic Recommendation Banner with Green, Orange, and Red states */}
                    <div className={cn(
                        "px-5 py-3.5 text-xs font-bold text-center border-t transition-all duration-300 flex items-center justify-center gap-2",
                        cameraStatus !== "granted"
                            ? "bg-gray-50 border-gray-100 text-gray-400"
                            : !cameraFullyReady && faceCountHistoryRef.current.filter(c => c === 1).length < 3
                                ? "bg-red-50 border-red-100 text-red-600 animate-pulse"
                                : cameraFullyReady
                                    ? "bg-green-50 border-green-100 text-green-700 font-extrabold"
                                    : "bg-orange-50 border-orange-100 text-orange-600"
                    )}>
                        {cameraStatus !== "granted" ? (
                            <span>Camera Access Required</span>
                        ) : !cameraFullyReady && faceCountHistoryRef.current.filter(c => c === 1).length < 3 ? (
                            <span>No face detected. Please center your face.</span>
                        ) : cameraFullyReady ? (
                            <span>Camera Secured &amp; Perfectly Aligned</span>
                        ) : (
                            <span>Adjust Position: {visualStatusMsg}</span>
                        )}
                    </div>
                </div>
                {/* Right Card: Interactive Steps Console */}
                <div className="bg-white rounded-[28px] p-6 shadow-sm border border-gray-100 flex flex-col justify-between min-h-[420px]">
                    {/* Top Inline Timeline Steps (Match 2nd Pic Exactly) */}
                    <div className="flex items-center gap-2.5 text-xs text-gray-400 font-bold tracking-wide">
                        <span className={cn(
                            "transition-all duration-300 px-3.5 py-1.5 rounded-full text-[11px]",
                            activeStep === 0
                                ? "bg-orange-500 text-white font-black"
                                : "text-gray-400 font-semibold"
                        )}>
                            1. Microphone
                        </span>
                        <span className="text-gray-300 font-normal">&gt;</span>
                        <span className={cn(
                            "transition-all duration-300 px-3.5 py-1.5 rounded-full text-[11px]",
                            activeStep === 1
                                ? "bg-orange-500 text-white font-black"
                                : "text-gray-400 font-semibold"
                        )}>
                            2. Speakers
                        </span>
                        <span className="text-gray-300 font-normal">&gt;</span>
                        <span className={cn(
                            "transition-all duration-300 px-3.5 py-1.5 rounded-full text-[11px]",
                            activeStep === 2
                                ? "bg-orange-500 text-white font-black"
                                : "text-gray-400 font-semibold"
                        )}>
                            3. Consent
                        </span>
                    </div>
                    {/* Step Card Inner Screens */}
                    <div className="flex-1 flex flex-col justify-center mt-6">
                        <AnimatePresence mode="wait">
                            {/* STAGE 1: Microphone Check */}
                            {activeStep === 0 && (
                                <motion.div
                                    key="mic-tab"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    className="flex flex-col justify-between h-full"
                                >
                                    {/* Sentence prompt card - prominent, clear, readable */}
                                    <div className="text-center my-2 animate-fadeIn">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Please read this sentence aloud:</p>
                                        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4 my-2 w-full shadow-sm">
                                            <span className="text-base font-bold text-orange-600 leading-snug block">
                                                &ldquo;{verifiedPhrase || "I am ready for my interview today"}&rdquo;
                                            </span>
                                        </div>
                                    </div>
                                    {/* Static circle progress — fills based on words matched */}
                                    {(() => {
                                        const targetWords = (verifiedPhrase || "").toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
                                        const spokenWordSet = new Set((liveTranscript).toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean));
                                        const matchedCount = micVerified ? targetWords.length : targetWords.filter(w => spokenWordSet.has(w)).length;
                                        const progress = targetWords.length > 0 ? matchedCount / targetWords.length : 0;
                                        const r = 28, circ = 2 * Math.PI * r;
                                        const dash = circ * progress;
                                        return (
                                            <div className="relative w-20 h-20 mx-auto my-3 flex items-center justify-center">
                                                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
                                                    <circle cx="32" cy="32" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
                                                    <circle cx="32" cy="32" r={r} fill="none"
                                                        stroke={micVerified ? "#34c759" : "#f97316"}
                                                        strokeWidth="4"
                                                        strokeLinecap="round"
                                                        strokeDasharray={`${dash} ${circ}`}
                                                        style={{ transition: "stroke-dasharray 0.3s ease" }}
                                                    />
                                                </svg>
                                                {micVerified ? (
                                                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                                                ) : (
                                                    <Mic className="w-6 h-6 text-orange-500" />
                                                )}
                                            </div>
                                        );
                                    })()}
                                    {/* Volume bar + captions + verified state */}
                                    {micVerified ? (
                                        /* SUCCESS STATE - big, unmissable green banner */
                                        <motion.div
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex flex-col items-center gap-3 my-2"
                                        >
                                            <div className="w-full bg-green-50 border border-green-200 rounded-2xl px-5 py-3 flex items-center gap-3">
                                                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                                <div>
                                                    <p className="text-xs font-black text-green-700">Microphone Verified!</p>
                                                    <p className="text-[10px] text-green-600 font-semibold">
                                                        {liveTranscript ? `We heard: "${liveTranscript.slice(0, 60)}"` : "Audio signal confirmed - mic is working."}
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Outlined Action footer */}
                                            <div className="w-full flex justify-end items-center pt-3 border-t border-gray-50 mt-2">
                                                <button
                                                    onClick={() => setActiveStep(1)}
                                                    className="rounded-full px-7 py-2.5 text-xs font-black transition-all shadow-lg bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-2"
                                                >
                                                    Next Step &rarr;
                                                </button>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        /* LISTENING / RECORD STATE */
                                        <div className="flex flex-col gap-3">
                                            {/* Live Mic Volume Bar */}
                                            <div className="w-full px-2">
                                                <div className="flex items-center gap-2">
                                                    <Mic className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <motion.div
                                                            className={cn(
                                                                "h-full rounded-full",
                                                                micVolumeLevel > 0.4 ? "bg-green-500" : micVolumeLevel > 0.1 ? "bg-orange-400" : "bg-gray-300"
                                                            )}
                                                            animate={{ width: `${Math.max(2, micVolumeLevel * 100)}%` }}
                                                            transition={{ duration: 0.08 }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Live transcript — every word shown as spoken */}
                                            <p className="text-[11px] text-center font-semibold tracking-wide min-h-[18px]">
                                                {isVerifying ? (
                                                    <span className="text-gray-400 flex items-center justify-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Verifying voice...</span>
                                                ) : liveTranscript ? (
                                                    <span className="text-orange-500 font-bold">&ldquo;{liveTranscript}&rdquo;</span>
                                                ) : isRecording ? (
                                                    <span className="text-orange-400 animate-pulse">Listening... read the sentence and click Stop</span>
                                                ) : (
                                                    <span className="text-gray-300">Press Record, read the sentence, then press Stop</span>
                                                )}
                                            </p>
                                            {/* Mismatch error + retry */}
                                            {liveTranscript && !micVerified && !isVerifying && !isRecording && (
                                                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                                    className="flex flex-col items-center gap-1.5">
                                                    <p className="text-[10px] text-red-500 font-semibold text-center">Didn&apos;t match. Please say the exact sentence and try again.</p>
                                                    <button
                                                        onClick={() => { retryMic(); }}
                                                        className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[10px] font-bold border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-all shadow-sm"
                                                    >
                                                        <RefreshCw className="w-3 h-3" /> Try Again
                                                    </button>
                                                </motion.div>
                                            )}
                                            {/* Record / Stop buttons */}
                                            <div className="flex items-center justify-center gap-3">
                                                {!isRecording ? (
                                                    <button
                                                        onClick={startRecording}
                                                        disabled={isVerifying}
                                                        className="flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-sm transition-all disabled:opacity-50"
                                                    >
                                                        <Mic className="w-3.5 h-3.5" /> Record
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={stopAndVerify}
                                                        className="flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold bg-red-500 hover:bg-red-600 text-white shadow-sm transition-all"
                                                    >
                                                        <span className="w-2.5 h-2.5 bg-white rounded-[2px]" /> Stop & Verify
                                                    </button>
                                                )}
                                            </div>
                                            {/* Next Step stays hidden until the microphone check passes */}
                                            <div className="flex justify-end pt-3 border-t border-gray-50">
                                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-300">
                                                    Finish mic verification to unlock next step
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                            {/* STAGE 2: Speakers Check */}
                            {activeStep === 1 && (
                                <motion.div
                                    key="speaker-tab"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    className="flex flex-col justify-between h-full"
                                >
                                    <div className="text-center my-4">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Click Play to verify speakers</p>
                                        {/* Play Sound trigger button */}
                                        <div className="flex flex-col items-center justify-center min-h-[90px]">
                                            <AnimatePresence mode="wait">
                                                {speakerStatus === "idle" || speakerStatus === "failed" ? (
                                                    <motion.button
                                                        key="play-btn"
                                                        onClick={playSpeakerTest}
                                                        className="w-14 h-14 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/15 transition-all"
                                                    >
                                                        <Play className="w-5 h-5 fill-current ml-0.5" />
                                                    </motion.button>
                                                ) : speakerStatus === "playing" ? (
                                                    <motion.div key="playing-pulse" className="flex items-center gap-1.5 h-14">
                                                        {[1, 2, 3, 4].map(i => (
                                                            <motion.div
                                                                key={i}
                                                                animate={{ scaleY: [1, 1.8, 1], opacity: [0.4, 1, 0.4] }}
                                                                transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                                                                className="w-1 h-6 bg-orange-500 rounded-full"
                                                            />
                                                        ))}
                                                    </motion.div>
                                                ) : speakerStatus === "awaiting" ? (
                                                    <motion.div key="awaiting-badge" className="flex flex-col items-center gap-1">
                                                        <div className="w-14 h-14 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/10 border border-orange-200">
                                                            <Volume2 className="w-6 h-6" />
                                                        </div>
                                                        <span className="text-[10px] font-bold text-orange-600 mt-2 uppercase tracking-wider">Did you hear it?</span>
                                                    </motion.div>
                                                ) : speakerStatus === "passed" ? (
                                                    <motion.div key="passed-badge" className="flex flex-col items-center gap-1">
                                                        <div className="w-14 h-14 rounded-full bg-[#34c759] text-white flex items-center justify-center shadow-lg shadow-green-500/10">
                                                            <CheckCircle2 className="w-6 h-6" />
                                                        </div>
                                                        <span className="text-[10px] font-bold text-[#34c759] mt-2 uppercase tracking-wider">Audio Passed</span>
                                                    </motion.div>
                                                ) : null}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                    {/* Yes / No simple options (Hides on idle retry loop to prevent overlap) */}
                                    {speakerStatus === "awaiting" && (
                                        <div className="flex items-center justify-center gap-4 my-2 animate-fadeIn">
                                            <button
                                                onClick={() => { setSpeakerStatus("passed"); setSpeakerRetryMsg(false); }}
                                                className="rounded-full px-5 py-2 text-xs font-bold border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-all"
                                            >
                                                Yes, I heard it
                                            </button>
                                            <button
                                                onClick={handleSpeakerFailure}
                                                className="rounded-full px-5 py-2 text-xs font-bold border border-red-200 text-red-650 bg-red-50 hover:bg-red-100 transition-all"
                                            >
                                                No sound
                                            </button>
                                        </div>
                                    )}
                                    {/* Outlined Action footer */}
                                    <div className="mt-8 flex justify-between items-center pt-4 border-t border-gray-50">
                                        <button
                                            onClick={() => setActiveStep(0)}
                                            className="text-[11px] font-bold text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            Back
                                        </button>
                                        <button
                                            onClick={() => setActiveStep(2)}
                                            disabled={speakerStatus !== "passed"}
                                            className={cn(
                                                "rounded-full px-6 py-2.5 text-xs font-bold transition-all shadow-sm border",
                                                speakerStatus === "passed"
                                                    ? "border-gray-300 hover:bg-gray-50 text-gray-700 cursor-pointer"
                                                    : "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
                                            )}
                                        >
                                            Next Step
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                            {/* STAGE 3: Checklist Consent & Complete */}
                            {activeStep === 2 && (
                                <motion.div
                                    key="consent-tab"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    className="flex flex-col justify-between h-full"
                                >
                                    <div className="space-y-4 my-2 animate-fadeIn">
                                        {/* Live status checklist — reads from actual verified state */}
                                        <div className="bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-100/50">
                                            <div className="flex items-center justify-between text-xs text-gray-600 font-semibold">
                                                <span>Camera Feed</span>
                                                {visualReady ? (
                                                    <span className="text-[#34c759] font-bold">✓ Calibrated</span>
                                                ) : (
                                                    <span className="text-orange-500 font-bold">⚠ Not Ready</span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between text-xs text-gray-600 font-semibold">
                                                <span>Microphone</span>
                                                {micVerified ? (
                                                    <span className="text-[#34c759] font-bold">✓ Verified</span>
                                                ) : (
                                                    <span className="text-orange-500 font-bold">⚠ Not Verified</span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between text-xs text-gray-600 font-semibold">
                                                <span>Speaker Output</span>
                                                {speakerStatus === "passed" ? (
                                                    <span className="text-[#34c759] font-bold">✓ Verified</span>
                                                ) : speakerStatus === "failed" ? (
                                                    <span className="text-orange-500 font-bold">⚠ Check Speakers</span>
                                                ) : (
                                                    <span className="text-orange-500 font-bold">⚠ Not Tested</span>
                                                )}
                                            </div>
                                        </div>
                                        {/* Dynamic mic source selector dropdown */}
                                        {devices.filter(d => d.kind === "audioinput").length > 1 && (
                                            <div className="relative" ref={micDropdownRef}>
                                                <button
                                                    onClick={() => setIsMicDropdownOpen(v => !v)}
                                                    className="w-full flex items-center justify-between text-[11px] bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-600 hover:bg-gray-50 transition-colors font-semibold shadow-sm"
                                                >
                                                    <span className="truncate">{devices.find(d => d.kind === "audioinput" && d.deviceId === selectedMicId)?.label || "Choose microphone"}</span>
                                                    <ChevronDown className="w-3.5 h-3.5 ml-2 flex-shrink-0" />
                                                </button>
                                                <AnimatePresence>
                                                    {isMicDropdownOpen && (
                                                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                                                            className="absolute z-20 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-36 overflow-y-auto">
                                                            {devices.filter(d => d.kind === "audioinput").map(d => (
                                                                <button key={d.deviceId} onClick={() => { setSelectedMicId(d.deviceId); setIsMicDropdownOpen(false); }}
                                                                    className={cn("w-full text-left text-xs px-4 py-2 hover:bg-gray-50 transition-colors font-medium", d.deviceId === selectedMicId && "bg-orange-50 text-orange-600")}>
                                                                    {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                                                                </button>
                                                            ))}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        )}
                                        {/* Consent Box (Native accent-orange style prevents any orange overlay blending/messiness) */}
                                        <div className="border border-orange-100 bg-orange-50/10 rounded-2xl p-4">
                                            <label className="group flex items-start gap-3 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={consentChecked}
                                                    onChange={(e) => setConsentChecked(e.target.checked)}
                                                    className="h-4 w-4 mt-0.5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer flex-shrink-0 accent-orange-500"
                                                />
                                                <span className="text-[11px] font-semibold text-gray-600 leading-relaxed group-hover:text-gray-800 transition-colors">
                                                    I agree and consent to capture dynamic photos during this interview session to verify my profile and ensure integrity.
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                    {/* Complete / Begin CTA */}
                                    <div className="mt-8 flex justify-between items-center pt-4 border-t border-gray-50">
                                        <button
                                            onClick={() => setActiveStep(1)}
                                            className="text-[11px] font-bold text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            Back
                                        </button>
                                        <button
                                            onClick={handleBeginInterview}
                                            disabled={!allReady || isStarting || snapshotUploading || !canBeginNow}
                                            className={cn(
                                                "rounded-full px-8 py-3 text-xs font-bold transition-all shadow-md flex items-center gap-2",
                                                allReady && !isStarting && !snapshotUploading && canBeginNow
                                                    ? "bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-600 hover:to-orange-500 text-white shadow-lg shadow-orange-500/10"
                                                    : "bg-gray-100 text-gray-400 cursor-not-allowed border border-transparent"
                                            )}
                                        >
                                            {isStarting || snapshotUploading ? (
                                                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Securing...</>
                                            ) : (
                                                <><Zap className="w-3.5 h-3.5" /> Begin Interview</>
                                            )}
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}
