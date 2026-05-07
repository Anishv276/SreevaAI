"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Camera, Mic, CheckCircle2, AlertCircle, Loader2, RefreshCw, Volume2, Activity, ChevronDown, Monitor, AudioLines, Wifi, Shield, Zap, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const VERIFICATION_PHRASES = [
    "Testing testing one two three",
    "My microphone is working now",
    "I can hear everything clearly",
    "The environment is quiet",
    "I am ready for the interview",
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
    const currentStepRef = useRef(0);
    const lastNoiseUpdateTimeRef = useRef(0);
    const smoothDbRef = useRef<number | null>(null);
    const noiseHistoryRef = useRef<number[]>([]);
    const sessionFinalTextRef = useRef("");
    const faceCountHistoryRef = useRef<number[]>([]); // 5-frame buffer for temporal consensus

    const [cameraStatus, setCameraStatus] = useState<CheckStatus>("idle");
    const [micStatus, setMicStatus] = useState<CheckStatus>("idle");
    const [verifiedPhrase, setVerifiedPhrase] = useState("");
    const [micVerified, setMicVerified] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);
    const [activeStep, setActiveStep] = useState(0);
    const [frequencies, setFrequencies] = useState<number[]>(new Array(40).fill(0));
    const [error, setError] = useState<string | null>(null);
    const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
    const [snapshotUploading, setSnapshotUploading] = useState(false);

    const [consentChecked, setConsentChecked] = useState(false);
    // Live transcript from speech recognition
    const [liveTranscript, setLiveTranscript] = useState("");
    const [interimTranscript, setInterimTranscript] = useState("");
    const [micRetryToken, setMicRetryToken] = useState(0);

    // Pick a default phrase on mount - "I am ready for the interview" as requested
    useEffect(() => {
        const defaultPhrase = "I am ready for the interview";
        verifiedPhraseRef.current = defaultPhrase;
        setVerifiedPhrase(defaultPhrase);
    }, []);

    // Device Selection
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [selectedMicId, setSelectedMicId] = useState('');
    const [isCamDropdownOpen, setIsCamDropdownOpen] = useState(false);
    const [isMicDropdownOpen, setIsMicDropdownOpen] = useState(false);

    const refreshPhrase = useCallback(() => {
        const remaining = VERIFICATION_PHRASES.filter(p => p !== verifiedPhrase);
        const randomPhrase = remaining[Math.floor(Math.random() * remaining.length)] || VERIFICATION_PHRASES[0];
        verifiedPhraseRef.current = randomPhrase;
        setVerifiedPhrase(randomPhrase);
        setMicVerified(false);
        verifiedRef.current = false;
        sessionFinalTextRef.current = "";
        setLiveTranscript("");
        setInterimTranscript("");
        setMicRetryToken(t => t + 1);
    }, [verifiedPhrase]);

    const retryMic = useCallback(() => {
        setMicVerified(false);
        verifiedRef.current = false;
        sessionFinalTextRef.current = "";
        setLiveTranscript("");
        setInterimTranscript("");
        setMicRetryToken(t => t + 1);
    }, []);

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

    // Background Noise
    const [noiseDb, setNoiseDb] = useState<number | null>(null);
    const [noiseMeasuring, setNoiseMeasuring] = useState(false);
    const [noiseBypass, setNoiseBypass] = useState(false);

    // Acoustic status logic
    const noiseStatusType = noiseDb === null ? "unknown" : noiseDb < 50 ? "good" : noiseDb <= 65 ? "moderate" : "high";
    const noisePassed = noiseDb !== null && noiseDb <= 65; // Block only on "high" (>65dB)

    // Speaker / Audio Playback
    const [speakerPlaying, setSpeakerPlaying] = useState(false);
    const [speakerStatus, setSpeakerStatus] = useState<"idle" | "playing" | "passed" | "failed">("idle");
    const [speakerTargetWord, setSpeakerTargetWord] = useState("");
    const [speakerRetryMsg, setSpeakerRetryMsg] = useState(false);
    const SPEAKER_KEYWORDS = ["READY", "CLEAR", "START", "INTERVIEW"];

    // Network Speed & Quality
    const [uploadSpeedMbps, setUploadSpeedMbps] = useState<number | null>(null);
    const [downloadSpeedMbps, setDownloadSpeedMbps] = useState<number | null>(null);
    const [displayUpload, setDisplayUpload] = useState<number | null>(null);
    const [displayDownload, setDisplayDownload] = useState<number | null>(null);
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const [jitterMs, setJitterMs] = useState<number | null>(null);
    const [speedTestRunning, setSpeedTestRunning] = useState(false);
    const pulseRunningRef = useRef(false);

    const [isNetworkLocked, setIsNetworkLocked] = useState(false);
    const networkQuality = useMemo(() => {
        if (isNetworkLocked) return "stable";
        if (downloadSpeedMbps === null || uploadSpeedMbps === null || latencyMs === null) return "testing";
        if (downloadSpeedMbps >= 10 && uploadSpeedMbps >= 5 && latencyMs < 80) return "stable";
        if (downloadSpeedMbps >= 5 && uploadSpeedMbps >= 2 && latencyMs < 150) return "acceptable";
        return "poor";
    }, [downloadSpeedMbps, uploadSpeedMbps, latencyMs]);

    const hardwareStatusMsg = useMemo(() => {
        switch (networkQuality) {
            case "stable": return "Your connection looks good-we should have a smooth interview 👍";
            case "acceptable": return "Your connection is okay, but you might notice slight delays.";
            case "poor": return "Your connection may affect the interview quality. If possible, try switching to a better network.";
            default: return "Analyzing your connection quality...";
        }
    }, [networkQuality]);
    const [bypassSpeedTest, setBypassSpeedTest] = useState(false);

    //  Visual Integrity (Signals 4, 5, 6) 
    const visualLandmarkerRef = useRef<any>(null);
    const visualRafRef = useRef<number | null>(null);
    const [visualSignals, setVisualSignals] = useState({
        alignment: false,
        proximity: false,
        lighting: false,
    });
    const [visualStatusMsg, setVisualStatusMsg] = useState("Initializing visual integrity check...");
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
                    if (!isAligned) errors.push(cx < 0.35 ? "Move right" : cx > 0.65 ? "Move left" : "Center your face");
                    if (!isProxGood) errors.push(widthRatio < 0.20 ? "Move closer" : "Move further back");
                    if (!lastLightGood) errors.push("Lighting is poor");

                    if (errors.length > 0) {
                        setVisualStatusMsg(errors.join(" • "));
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

    const allReady = cameraStatus === "granted" &&
        micStatus === "granted" &&
        micVerified &&
        (noiseBypass || noisePassed) &&
        (speakerStatus === "passed" || speakerStatus === "failed") &&
        visualReady &&
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

    //  Speech detection with live transcript display 
    // KEY BUGS FIXED:
    // 1. Use event.resultIndex to process ONLY new results - not re-accumulate
    //    all results from index 0 (which caused "stuck" display as old results
    //    kept overwriting the live text with stale final segments).
    // 2. Persist finalTranscript across session restarts in a ref - Chrome's
    //    SpeechRecognition stops and restarts frequently; without a ref the
    //    accumulated final text is lost on each restart.
    // 3. Read verifiedPhrase from verifiedPhraseRef (not the state closure) so
    //    the effect always has the current phrase even if it was set after mount.
    useEffect(() => {
        if (micStatus !== "granted" || verifiedRef.current) return;

        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) { setSpeechSupported(false); return; }

        const r = new SR();
        r.continuous = true;
        r.interimResults = true;
        r.lang = "en-US";
        recogRef.current = r;

        r.onresult = (event: any) => {
            if (verifiedRef.current) return;

            // Only process results that are new since the last event
            let newFinal = "";
            let interimText = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) newFinal += result[0].transcript + " ";
                else interimText += result[0].transcript;
            }

            if (newFinal) sessionFinalTextRef.current += newFinal;

            const displayFinal = sessionFinalTextRef.current.trim();
            setLiveTranscript(displayFinal);
            setInterimTranscript(interimText.trim());

            const combined = (sessionFinalTextRef.current + " " + interimText).toLowerCase().trim();
            // Always read from ref - avoids stale closure if phrase was set after effect ran
            const targetPhrase = verifiedPhraseRef.current.toLowerCase();
            if (!targetPhrase) return;

            // 80% word match - handles accents and partial recognition
            const targetWords = targetPhrase.split(/\s+/).filter(Boolean);
            const matchedWords = targetWords.filter(w => combined.includes(w));
            const matchRatio = matchedWords.length / targetWords.length;

            if (matchRatio >= 0.8 || combined.includes(targetPhrase)) {
                verifiedRef.current = true;
                setMicVerified(true);
                setActiveStep(1);
                setInterimTranscript("");
                try { r.stop(); } catch { }
            }
        };

        r.onerror = (event: any) => {
            // no-speech and aborted are normal during continuous recognition - ignore them
            if (event.error === "no-speech" || event.error === "aborted") return;
            console.warn("[SpeechRecog] error:", event.error);
        };

        r.onend = () => {
            if (!verifiedRef.current && recogRef.current === r) {
                // Short delay then restart - keeps recognition running continuously
                setTimeout(() => {
                    if (!verifiedRef.current && recogRef.current === r) {
                        try { r.start(); } catch { }
                    }
                }, 300);
            }
        };

        try { r.start(); } catch { }

        return () => {
            if (recogRef.current === r) { try { r.abort(); } catch { } recogRef.current = null; }
        };
        // Re-run when micStatus OR micRetryToken changes - forces hard reset of engine

    }, [micStatus, micRetryToken]);

    //  Audio visualizer 
    const startVisualizer = useCallback(() => {
        const tick = () => {
            if (!analyzerRef.current) return;
            const analyzer = analyzerRef.current;

            // 1. Frequency data for waveform
            const freqData = new Uint8Array(analyzer.frequencyBinCount);
            analyzer.getByteFrequencyData(freqData);
            const bars = 40;
            const binSize = Math.floor(freqData.length / bars);
            setFrequencies(Array.from({ length: bars }, (_, i) => {
                let sum = 0;
                for (let j = 0; j < binSize; j++) sum += freqData[i * binSize + j];
                return sum / binSize / 255;
            }));

            // 2. Continuous Noise Monitoring (Time Domain)
            const timeData = new Uint8Array(analyzer.fftSize);
            analyzer.getByteTimeDomainData(timeData);

            let sumSq = 0;
            for (let i = 0; i < timeData.length; i++) {
                const val = (timeData[i] - 128) / 128; // Normalize to [-1, 1]
                sumSq += val * val;
            }
            const rms = Math.sqrt(sumSq / timeData.length);
            // Formula: dB = 20 * log10(RMS) + calibration. 
            // We adjusted calibration from +100 to +88 to better match real-world SPL (Sound Pressure Level)
            // across consumer hardware, ensuring 'quiet' actually looks quiet (35-45dB).
            const rawDb = 20 * Math.log10(Math.max(rms, 0.00001)) + 88;

            // Apply smoothing (Exponential Moving Average)
            const alpha = 0.15; // Adjustment speed
            smoothDbRef.current = smoothDbRef.current === null
                ? rawDb
                : smoothDbRef.current * (1 - alpha) + rawDb * alpha;

            // Throttle UI update to ~150ms for better readability without lag
            const now = performance.now();
            if (now - lastNoiseUpdateTimeRef.current > 150) {
                // Add to history for floor estimation (P10)
                noiseHistoryRef.current.push(rawDb);
                if (noiseHistoryRef.current.length > 15) { // 1.5 second window (15 * 100ms approximation)
                    noiseHistoryRef.current.shift();
                }

                if (noiseHistoryRef.current.length > 2) {
                    // Calculate noise floor (P15 - slightly more responsive than P10)
                    const sorted = [...noiseHistoryRef.current].sort((a, b) => a - b);
                    const pIndex = Math.floor(sorted.length * 0.15);
                    const noiseFloor = sorted[pIndex];

                    // Add a tiny bit of random jitter (0.1) if it's perfectly stable 
                    // to prevent the "stuck" feel, but keep it integer for the UI
                    setNoiseDb(Math.round(noiseFloor));
                }

                lastNoiseUpdateTimeRef.current = now;
            }

            animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);
    }, []);

    // (measureNoiseFloor removed as it's now integrated and continuous)

    //  Speaker / Audio Playback Test 
    // ROOT CAUSE OF SILENCE: Chrome creates AudioContext in "suspended" state
    // when a mic AudioContext already exists. The previous code called
    // scheduleAudio() before resume() had actually resolved - so actx.currentTime
    // was still 0 and the oscillator start/stop times were wrong.
    // FIX: make the entire function async, always await resume(), then schedule.
    // A fresh AudioContext is used every time to avoid any state from the mic ctx.
    // setTimeout fallback ensures confirm buttons always appear even if onended
    // doesn't fire (unreliable in some Chrome versions).
    const playSpeakerTest = useCallback(async () => {
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

            const prompt = `Let's do a quick audio check. When you hear the word ${word}, just click Yes.`;
            const utter = new SpeechSynthesisUtterance(prompt);

            // Try to find a premium/natural sounding voice
            const voices = synth.getVoices();
            const preferredVoice = voices.find(v => (v.name.includes("Google") || v.name.includes("Natural")) && v.lang.startsWith("en"))
                || voices.find(v => v.lang.startsWith("en"))
                || voices[0];

            if (preferredVoice) utter.voice = preferredVoice;
            utter.rate = 0.95; // Slightly slower for better clarity
            utter.pitch = 1.0;
            utter.volume = 1.0; // Max browser-supported volume for speech synthesis

            utter.onend = () => {
                setSpeakerPlaying(false);
            };

            utter.onerror = (e) => {
                console.error("[Speaker] TTS error:", e);
                setSpeakerPlaying(false);
            };

            synth.speak(utter);

            // Safety fallback to show buttons if TTS fails to fire onend
            setTimeout(() => {
                setSpeakerPlaying(false);
            }, 6000);

        } catch (err) {
            console.error("[Speaker] Error:", err);
            setSpeakerPlaying(false);
        }
    }, [SPEAKER_KEYWORDS]);

    const handleSpeakerFailure = () => {
        setSpeakerStatus("failed");
        setSpeakerRetryMsg(true);
    };

    const testNetworkSpeed = useCallback(async (isFullTest: boolean = true) => {
        // Disabled as requested
        return;
    }, []);

    // HYPER-LIVE: Fluctuate display speeds based on latency pulses
    useEffect(() => {
        if (!downloadSpeedMbps || !uploadSpeedMbps || !latencyMs) return;

        // Apply a subtle, realistic fluctuation (+/- 0.5% - 2%)
        // If latency is higher, speed tends to fluctuate more downward
        const latencyPenalty = Math.max(0, (latencyMs - 50) / 1000);
        const randomFactor = 1 + (Math.random() * 0.02 - (0.01 + latencyPenalty));

        setDisplayDownload(prev => {
            const next = downloadSpeedMbps * randomFactor;
            // Smooth transition (lerp 0.3)
            return prev ? prev * 0.7 + next * 0.3 : next;
        });

        setDisplayUpload(prev => {
            const next = uploadSpeedMbps * randomFactor;
            return prev ? prev * 0.7 + next * 0.3 : next;
        });
    }, [latencyMs, downloadSpeedMbps, uploadSpeedMbps]);

    const requestPermissions = useCallback(async (cameraId?: string, micId?: string) => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        setError(null);
        setCameraStatus("requesting");
        setMicStatus("requesting");
        setMicVerified(false);
        setActiveStep(0);
        currentStepRef.current = 0;
        verifiedRef.current = false;
        snapshotDoneRef.current = false;
        setSnapshotUrl(null);
        setNoiseDb(null);
        setNoiseMeasuring(false);
        setNoiseBypass(false);
        noiseHistoryRef.current = [];
        smoothDbRef.current = null;
        setSpeakerStatus("idle");
        setSpeakerPlaying(false);
        setLiveTranscript("");
        setInterimTranscript("");
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
        // Run full check on mount
        testNetworkSpeed(true);

        const networkInterval = setInterval(() => {
            testNetworkSpeed(false); // Background pulse every 25s
        }, 25000);

        return () => {
            clearInterval(networkInterval);
            if (animRef.current) cancelAnimationFrame(animRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
            audioCtxRef.current?.close();
            if (recogRef.current) try { recogRef.current.abort(); } catch { }
        };
    }, [testNetworkSpeed]); // stable logic

    //  Readiness score for progress bar 
    const checks = [
        cameraStatus === "granted",
        micStatus === "granted" && micVerified,
        noiseBypass || noisePassed,
        speakerStatus === "passed" || speakerStatus === "failed",
        visualReady,
    ];
    const readyCount = checks.filter(Boolean).length;
    const progressPct = Math.round((readyCount / checks.length) * 100);

    //  Status helpers 
    const StatusIcon = ({ ok, loading, type }: { ok: boolean; loading?: boolean; type?: "success" | "warning" | "error" }) => {
        if (loading) return <Loader2 className="w-4 h-4 animate-spin text-orange-500" />;

        // If an explicit type is provided (like for noise), use it
        if (type === "success") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
        if (type === "warning") return <AlertCircle className="w-4 h-4 text-yellow-500" />;
        if (type === "error") return <AlertCircle className="w-4 h-4 text-red-500" />;

        // Fallback to simple boolean logic
        if (ok) return <CheckCircle2 className="w-4 h-4 text-green-500" />;
        return <AlertCircle className="w-4 h-4 text-red-400" />;
    };

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
        <div className="min-h-screen bg-white">
            {/* Header */}
            <div className="border-b border-gray-100 px-6 py-4">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
                        <p className="text-sm text-gray-500">Hi {candidateName} - let&apos;s make sure everything is set up before we begin.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">{readyCount}/{checks.length} ready</span>
                        <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-orange-500 rounded-full"
                                animate={{ width: `${progressPct}%` }}
                                transition={{ duration: 0.4 }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Error Banner */}
            <AnimatePresence>
                {(error || errorMessage) && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="bg-red-50 border-b border-red-100 px-6 py-3"
                    >
                        <div className="max-w-6xl mx-auto flex items-center gap-2 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error || errorMessage}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Grid */}
            <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/*  Column 1: Camera  */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl flex flex-col relative">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl">
                        <div className="flex items-center gap-2">
                            <Camera className="w-4 h-4 text-gray-600" />
                            <span className="font-medium text-gray-900 text-sm">Camera</span>
                        </div>
                        <StatusIcon ok={cameraStatus === "granted"} loading={cameraStatus === "requesting"} />
                    </div>

                    {/* Video preview */}
                    <div className="relative bg-gray-950 flex-1 h-[320px] overflow-hidden group">
                        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />

                        {/* Visual Integrity Alert Notification (Simple bottom bar replacement) */}
                        {cameraStatus === "granted" && (
                            <AnimatePresence>
                                {visualStatusMsg && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute bottom-4 inset-x-4 z-20 flex justify-center pointer-events-none"
                                    >
                                        <div className={cn(
                                            "text-white px-4 py-2.5 rounded-xl shadow-lg border flex items-center gap-2.5 max-w-[90%] pointer-events-auto transition-colors duration-300",
                                            visualReady ? "bg-green-600 border-green-500/50" : "bg-orange-500 border-orange-400/50"
                                        )}>
                                            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                                                {visualReady ? (
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                                ) : (
                                                    <AlertCircle className="w-3.5 h-3.5 text-white" />
                                                )}
                                            </div>
                                            <p className="text-[11px] font-black uppercase tracking-widest leading-none drop-shadow-sm">
                                                {visualStatusMsg}
                                            </p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        )}

                        {cameraStatus !== "granted" && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <Camera className="w-8 h-8 text-gray-500" />
                                <span className="text-xs text-gray-400">
                                    {cameraStatus === "requesting" ? "Requesting access..." : cameraStatus === "denied" ? "Camera denied" : "Camera off"}
                                </span>
                            </div>
                        )}
                        {snapshotUploading && (
                            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                            </div>
                        )}
                    </div>

                    {/* Camera device selector */}
                    <div className="px-5 py-4 flex flex-col gap-3">
                        {cameraStatus === "denied" && (
                            <p className="text-xs text-red-500">Camera access was denied. Please allow it in your browser settings and refresh.</p>
                        )}
                        {devices.filter(d => d.kind === "videoinput").length > 1 && (
                            <div className="relative" ref={camDropdownRef}>
                                <button
                                    onClick={() => setIsCamDropdownOpen(v => !v)}
                                    className="w-full flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100 transition-colors"
                                >
                                    <span className="truncate">{devices.find(d => d.kind === "videoinput" && d.deviceId === selectedCameraId)?.label || "Select camera"}</span>
                                    <ChevronDown className="w-3 h-3 ml-2 flex-shrink-0" />
                                </button>
                                <AnimatePresence>
                                    {isCamDropdownOpen && (
                                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                                            className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                            {devices.filter(d => d.kind === "videoinput").map(d => (
                                                <button key={d.deviceId} onClick={() => { setSelectedCameraId(d.deviceId); setIsCamDropdownOpen(false); }}
                                                    className={cn("w-full text-left text-xs px-3 py-2 hover:bg-gray-50 transition-colors", d.deviceId === selectedCameraId && "bg-orange-50 text-orange-600")}>
                                                    {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>

                {/*  Column 2: Microphone  */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl flex flex-col relative">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl">
                        <div className="flex items-center gap-2">
                            <Mic className="w-4 h-4 text-gray-600" />
                            <span className="font-medium text-gray-900 text-sm">Microphone</span>
                        </div>
                        <StatusIcon ok={micStatus === "granted" && micVerified} loading={micStatus === "requesting"} />
                    </div>

                    <div className="px-5 py-5 flex flex-col gap-5 flex-1 h-[320px] justify-between">
                        {/* Waveform visualizer */}
                        <div className="flex flex-col items-center justify-center gap-3">
                            <div className="flex items-end justify-center gap-1 h-14 bg-gray-50/50 w-full rounded-2xl px-6 border border-gray-100/50">
                                {frequencies.slice(0, 30).map((v, i) => (
                                    <motion.div
                                        key={i}
                                        className={cn(
                                            "w-1 rounded-full bg-gradient-to-t",
                                            micVerified ? "from-green-500 to-green-300" : "from-orange-500 to-orange-300"
                                        )}
                                        animate={{ height: `${Math.max(4, v * 48)}px` }}
                                        transition={{ duration: 0.05 }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Verification phrase header */}
                        <div className="flex items-center justify-between px-2 mb-1.5">
                            <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">
                                Just say aloud
                            </span>
                            <button onClick={retryMic} className="flex items-center gap-1.5 px-2 py-1 hover:bg-orange-50 rounded-lg text-orange-500 transition-all group" title="Retry">
                                <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Retry</span>
                            </button>
                        </div>

                        <div className="bg-white border border-orange-100 rounded-2xl px-4 py-5 shadow-sm shadow-orange-50/50 relative overflow-hidden">
                            <p className="text-lg font-bold text-gray-900 leading-tight text-center">&ldquo;{verifiedPhrase}&rdquo;</p>
                        </div>

                        {/* Live transcript - Sleeker design */}
                        <div className="bg-gray-50/50 border border-gray-100 rounded-2xl px-4 py-3 min-h-[70px] flex flex-col justify-center">
                            {micVerified ? (
                                <div className="flex items-center justify-center gap-2 text-green-600">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span className="text-sm font-bold tracking-tight">Perfect - clear audio 👍</span>
                                </div>
                            ) : !speechSupported ? (
                                <p className="text-[10px] text-red-500 text-center uppercase font-bold">Transcription unsupported</p>
                            ) : micStatus !== "granted" ? (
                                <p className="text-[10px] text-gray-400 text-center uppercase font-bold tracking-widest">Awaiting access...</p>
                            ) : (
                                <div className="text-center">
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">Hearing you</p>
                                    <p className="text-sm text-gray-700 leading-snug font-medium italic">
                                        {liveTranscript || <span className="text-gray-300">Wait for cue...</span>}
                                        {interimTranscript && <span className="text-gray-400"> {interimTranscript}</span>}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Mic device selector */}
                        {devices.filter(d => d.kind === "audioinput").length > 1 && (
                            <div className="relative" ref={micDropdownRef}>
                                <button
                                    onClick={() => setIsMicDropdownOpen(v => !v)}
                                    className="w-full flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100 transition-colors"
                                >
                                    <span className="truncate">{devices.find(d => d.kind === "audioinput" && d.deviceId === selectedMicId)?.label || "Select microphone"}</span>
                                    <ChevronDown className="w-3 h-3 ml-2 flex-shrink-0" />
                                </button>
                                <AnimatePresence>
                                    {isMicDropdownOpen && (
                                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                                            className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                            {devices.filter(d => d.kind === "audioinput").map(d => (
                                                <button key={d.deviceId} onClick={() => { setSelectedMicId(d.deviceId); setIsMicDropdownOpen(false); }}
                                                    className={cn("w-full text-left text-xs px-3 py-2 hover:bg-gray-50 transition-colors", d.deviceId === selectedMicId && "bg-orange-50 text-orange-600")}>
                                                    {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>

                {/*  Column 3: Noise + Speaker + Network  */}
                <div className="flex flex-col gap-[18px]">

                    {/* Background Noise */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <AudioLines className="w-4 h-4 text-gray-600" />
                                <span className="font-medium text-gray-900 text-sm">Background Noise</span>
                            </div>
                            <StatusIcon
                                ok={noiseBypass || noisePassed}
                                loading={noiseMeasuring}
                                type={noiseBypass ? "success" : noiseStatusType === "good" ? "success" : noiseStatusType === "moderate" ? "warning" : "error"}
                            />
                        </div>
                        {noiseBypass ? (
                            <p className="text-xs text-gray-400">Skipped</p>
                        ) : noiseDb !== null ? (
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={cn(
                                            "h-full rounded-full transition-all duration-500",
                                            noiseStatusType === "good" ? "bg-green-400" :
                                                noiseStatusType === "moderate" ? "bg-yellow-400" : "bg-red-400"
                                        )}
                                            style={{ width: `${Math.min(100, (noiseDb / 80) * 100)}%` }} />
                                    </div>
                                    <span className={cn(
                                        "text-xs font-semibold whitespace-nowrap",
                                        noiseStatusType === "good" ? "text-green-600" :
                                            noiseStatusType === "moderate" ? "text-yellow-600" : "text-red-500"
                                    )}>{noiseDb.toFixed(0)} dB</span>
                                </div>
                                <div className="flex items-center justify-between gap-1.5">
                                    {noiseStatusType === "good" && <p className="text-[10px] text-green-600 font-medium">🟢 Clean audio - Excellent</p>}
                                    {noiseStatusType === "moderate" && <p className="text-[10px] text-yellow-600 font-medium">🟡 Acceptable noise - Please minimize sound</p>}
                                    {noiseStatusType === "high" && <p className="text-[10px] text-red-500 font-medium">🔴 High noise - Please quiet the room</p>}

                                    {noiseStatusType === "high" && (
                                        <button onClick={() => setNoiseBypass(true)} className="text-[10px] text-gray-400 hover:text-gray-600 underline">Skip</button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 italic">Listening for room noise...</p>
                        )}
                    </div>

                    {/* Speaker Test */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Volume2 className="w-4 h-4 text-gray-600" />
                                <span className="font-medium text-gray-900 text-sm">Speaker Verification</span>
                            </div>
                            <StatusIcon ok={speakerStatus === "passed"} loading={speakerStatus === "playing"} />
                        </div>

                        <div className="space-y-3">
                            <AnimatePresence mode="wait">
                                {speakerStatus === "idle" || speakerStatus === "failed" ? (
                                    <motion.div key="play" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <button onClick={playSpeakerTest} disabled={speakerPlaying}
                                            className="w-full flex items-center justify-center gap-2 bg-orange-50 hover:bg-orange-100 text-orange-600 text-xs font-semibold py-2.5 rounded-xl transition-all border border-orange-100 disabled:opacity-50">
                                            {speakerPlaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                            {speakerRetryMsg ? "Try once more" : "Play Voice Check"}
                                        </button>
                                        {speakerRetryMsg && (
                                            <p className="mt-2 text-[10px] text-gray-500 italic text-center leading-relaxed">
                                                No worries - let's try that once more. <br />Ensure your volume is up 👍
                                            </p>
                                        )}
                                    </motion.div>
                                ) : speakerStatus === "playing" ? (
                                    <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        className="bg-orange-50/50 border border-orange-100 rounded-xl p-3 text-center">
                                        <div className="flex justify-center gap-1 mb-2">
                                            {[1, 2, 3].map(i => (
                                                <motion.div key={i} animate={{ scaleY: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                                                    className="w-1 h-3 bg-orange-400 rounded-full" />
                                            ))}
                                        </div>
                                        <p className="text-[11px] text-orange-700 font-medium">Click YES when you hear: <span className="font-bold underline">{speakerTargetWord}</span></p>
                                    </motion.div>
                                ) : null}
                            </AnimatePresence>

                            {!speakerPlaying && (speakerStatus === "playing" || (speakerStatus === "failed" && !speakerRetryMsg)) && (
                                <motion.div key="actions" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex gap-2">
                                    <button onClick={() => { setSpeakerStatus("passed"); setSpeakerRetryMsg(false); }}
                                        className="flex-1 text-xs font-semibold px-3 py-2 rounded-xl bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition-colors">
                                        Yes, I heard it
                                    </button>
                                    <button onClick={handleSpeakerFailure}
                                        className="flex-1 text-xs font-semibold px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">
                                        No sound
                                    </button>
                                </motion.div>
                            )}

                            {speakerStatus === "passed" && (
                                <motion.div key="passed" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span className="text-[11px] font-medium">Speaker verified successfully</span>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom CTA */}
            <div className="border-t border-gray-100 px-6 py-5">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex flex-col gap-1.5 flex-1 max-w-xl">
                        <label className="group flex items-start gap-3 cursor-pointer select-none">
                            <div className="relative flex items-center mt-1">
                                <input
                                    type="checkbox"
                                    checked={consentChecked}
                                    onChange={(e) => setConsentChecked(e.target.checked)}
                                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-gray-200 transition-all checked:border-orange-500 checked:bg-orange-500 hover:border-orange-300"
                                />
                                <CheckCircle2 className="pointer-events-none absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity peer-checked:opacity-100" />
                            </div>
                            <span className="text-xs font-semibold text-gray-600 group-hover:text-gray-900 transition-colors leading-relaxed">
                                A photo is captured during hardware setup to verify your identity throughout this interview session
                            </span>
                        </label>
                        <div className="text-[10px] items-center gap-1.5 text-gray-400 font-medium ml-8">
                            {allReady
                                ? "All checks passed - you're ready to begin!"
                                : `${checks.length - readyCount} check${checks.length - readyCount !== 1 ? "s" : ""} remaining`}
                        </div>
                    </div>

                    <button
                        onClick={handleBeginInterview}
                        disabled={!allReady || isStarting || snapshotUploading}
                        className={cn(
                            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all",
                            allReady && !isStarting && !snapshotUploading
                                ? "bg-orange-500 hover:bg-orange-600 text-white shadow-sm"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        )}
                    >
                        {isStarting || snapshotUploading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> {snapshotUploading ? "Securing Session..." : "Starting..."}</>
                        ) : (
                            <><Zap className="w-4 h-4" /> Begin Interview</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
