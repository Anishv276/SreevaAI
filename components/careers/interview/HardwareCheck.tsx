"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
    onComplete: () => void;
    isStarting?: boolean;
    errorMessage?: string | null;
    candidateName?: string;
    applicationId?: string;
    title?: string;
}

type CheckStatus = "idle" | "requesting" | "granted" | "denied";

export function HardwareCheck({
    onComplete,
    isStarting = false,
    errorMessage = null,
    candidateName = "candidate",
    applicationId = "unknown",
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
    const verifiedPhraseRef = useRef(""); // Always holds latest phrase — avoids stale closure in speech effect
    const snapshotDoneRef = useRef(false);
    const currentStepRef = useRef(0);
    const lastNoiseUpdateTimeRef = useRef(0);
    const smoothDbRef = useRef<number | null>(null);
    const noiseHistoryRef = useRef<number[]>([]);
    const sessionFinalTextRef = useRef("");

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

    // Live transcript from speech recognition
    const [liveTranscript, setLiveTranscript] = useState("");
    const [interimTranscript, setInterimTranscript] = useState("");
    const [micRetryToken, setMicRetryToken] = useState(0);

    // Pick a default phrase on mount — "I am ready for the interview" as requested
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

    // Network Speed
    const [uploadSpeedMbps, setUploadSpeedMbps] = useState<number | null>(null);
    const [downloadSpeedMbps, setDownloadSpeedMbps] = useState<number | null>(null);
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const [jitterMs, setJitterMs] = useState<number | null>(null);
    const [speedTestRunning, setSpeedTestRunning] = useState(false);
    const [bypassSpeedTest, setBypassSpeedTest] = useState(false);

    // Face Detection
    const [faceWarning, setFaceWarning] = useState<string | null>(null);
    const [faceVerified, setFaceVerified] = useState(false);
    const [faceModelReady, setFaceModelReady] = useState(false);
    const [faceModelFailed, setFaceModelFailed] = useState(false);
    const faceDetectorRef = useRef<any>(null);
    const faceDetectionAnimRef = useRef<number | null>(null);
    const lastVideoTimeRef = useRef(-1);
    const faceHistoryRef = useRef<number[]>([]);

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
        (faceModelFailed || (faceVerified && !faceWarning)) &&
        (noiseBypass || noisePassed) &&
        (speakerStatus === "passed" || speakerStatus === "failed") &&
        (bypassSpeedTest || (
            (uploadSpeedMbps !== null && uploadSpeedMbps >= 3.0) &&
            (downloadSpeedMbps !== null && downloadSpeedMbps >= 3.0) &&
            (latencyMs !== null && latencyMs < 300)
        ));

    // Suppress TF Lite logs
    useEffect(() => {
        const originalInfo = console.info.bind(console);
        const originalLog = console.log.bind(console);
        const isNoise = (msg: unknown) =>
            typeof msg === "string" && (msg.includes("XNNPACK") || msg.includes("TensorFlow Lite") || msg.includes("Created TensorFlow"));
        console.info = (...args: unknown[]) => { if (!isNoise(args[0])) originalInfo(...args); };
        console.log = (...args: unknown[]) => { if (!isNoise(args[0])) originalLog(...args); };
        return () => { console.info = originalInfo; console.log = originalLog; };
    }, []);

    // MediaPipe Face Landmarker
    useEffect(() => {
        let mounted = true;
        const loadModel = async () => {
            try {
                const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
                );
                const detector = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                        delegate: "CPU"
                    },
                    outputFaceBlendshapes: false,
                    runningMode: "VIDEO",
                    numFaces: 2
                });
                if (mounted) { faceDetectorRef.current = detector; setFaceModelReady(true); }
            } catch {
                if (mounted) setFaceModelFailed(true);
            }
        };
        loadModel();
        return () => { mounted = false; };
    }, []);

    const startFaceDetection = useCallback(() => {
        const detect = () => {
            faceDetectionAnimRef.current = requestAnimationFrame(detect);
            const video = videoRef.current;
            if (!video || video.readyState < 2 || !faceDetectorRef.current || video.paused || video.ended) return;
            if (video.currentTime === lastVideoTimeRef.current) return;
            lastVideoTimeRef.current = video.currentTime;
            try {
                const result = faceDetectorRef.current.detectForVideo(video, performance.now());
                const currentNumFaces = (result?.faceLandmarks) ? result.faceLandmarks.length : 0;
                faceHistoryRef.current.push(currentNumFaces);
                if (faceHistoryRef.current.length > 5) faceHistoryRef.current.shift();
                if (faceHistoryRef.current.length < 5) return;
                const counts: Record<number, number> = {};
                faceHistoryRef.current.forEach(n => counts[n] = (counts[n] || 0) + 1);
                const majorityEntry = Object.entries(counts).find(([, c]) => c >= 3);
                if (!majorityEntry) return;
                const consensusNumFaces = Number(majorityEntry[0]);
                const setFace = (warning: string | null) => { setFaceWarning(warning); setFaceVerified(warning === null); };
                if (consensusNumFaces === 0) { setFace("Please position your face in frame"); return; }
                if (consensusNumFaces > 1) { setFace("Only one person allowed in frame"); return; }
                if (!result?.faceLandmarks || result.faceLandmarks.length !== 1) return;
                const landmarks = result.faceLandmarks[0];
                let minX = 1, maxX = 0, minY = 1, maxY = 0;
                for (const pt of landmarks) {
                    if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
                    if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
                }
                const faceWidth = maxX - minX; const faceHeight = maxY - minY;
                const rawCx = (minX + maxX) / 2; const cx = 1 - rawCx; const cy = (minY + maxY) / 2;
                if (cx < 0.35 || cx > 0.65 || cy < 0.25 || cy > 0.55) { setFace("Please center your face on the screen"); return; }
                if (faceWidth < 0.20) { setFace("Please move closer to the camera"); return; }
                if (faceWidth > 0.55) { setFace("Please move slightly back"); return; }
                const canvas = document.createElement('canvas');
                canvas.width = 30; canvas.height = 30;
                const ctx = canvas.getContext('2d');
                if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) { setFace(null); return; }
                ctx.drawImage(video, Math.max(0, minX * video.videoWidth), Math.max(0, minY * video.videoHeight),
                    Math.min(faceWidth * video.videoWidth, video.videoWidth), Math.min(faceHeight * video.videoHeight, video.videoHeight), 0, 0, 30, 30);
                const imgData = ctx.getImageData(0, 0, 30, 30);
                let totalLuminance = 0;
                for (let i = 0; i < imgData.data.length; i += 4) {
                    const r = imgData.data[i], g = imgData.data[i + 1], b = imgData.data[i + 2];
                    totalLuminance += Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
                }
                const avgBrightness = totalLuminance / 900;
                if (avgBrightness < 70) setFace("Environment is too dark. Increase lighting.");
                else if (avgBrightness > 200) setFace("Environment is too bright (reduce backlight).");
                else setFace(null);
            } catch { }
        };
        faceDetectionAnimRef.current = requestAnimationFrame(detect);
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
        setSnapshotUploading(true);
        try {
            const r = await fetch("/api/upload/interview-snapshot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageDataUrl: dataUrl, candidateName, applicationId, label }),
            });
            const resBody = await r.json();
            if (resBody.status === "queued" || resBody.url) snapshotDoneRef.current = true;
        } catch { } finally {
            setSnapshotUploading(false);
        }
    }, [candidateName, applicationId]);

    // ── Speech detection with live transcript display ────────────────────────
    // KEY BUGS FIXED:
    // 1. Use event.resultIndex to process ONLY new results — not re-accumulate
    //    all results from index 0 (which caused "stuck" display as old results
    //    kept overwriting the live text with stale final segments).
    // 2. Persist finalTranscript across session restarts in a ref — Chrome's
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
            // Always read from ref — avoids stale closure if phrase was set after effect ran
            const targetPhrase = verifiedPhraseRef.current.toLowerCase();
            if (!targetPhrase) return;

            // 80% word match — handles accents and partial recognition
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
            // no-speech and aborted are normal during continuous recognition — ignore them
            if (event.error === "no-speech" || event.error === "aborted") return;
            console.warn("[SpeechRecog] error:", event.error);
        };

        r.onend = () => {
            if (!verifiedRef.current && recogRef.current === r) {
                // Short delay then restart — keeps recognition running continuously
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
        // Re-run when micStatus OR micRetryToken changes — forces hard reset of engine
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [micStatus, micRetryToken]);

    // ── Audio visualizer ────────────────────────────────────────────────────
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

    // ── Speaker / Audio Playback Test ────────────────────────────────────────
    // ROOT CAUSE OF SILENCE: Chrome creates AudioContext in "suspended" state
    // when a mic AudioContext already exists. The previous code called
    // scheduleAudio() before resume() had actually resolved — so actx.currentTime
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

    const testNetworkSpeed = useCallback(async () => {
        setSpeedTestRunning(true);
        try {
            const pings = [];
            for (let i = 0; i < 10; i++) {
                const start = performance.now();
                await fetch("/api/speedtest", { method: "POST", headers: { "Content-Length": "0" } });
                pings.push(performance.now() - start);
                await new Promise(r => setTimeout(r, 50));
            }
            const avgLatency = pings.reduce((a, b) => a + b, 0) / pings.length;
            let totalDiff = 0;
            for (let i = 1; i < pings.length; i++) totalDiff += Math.abs(pings[i] - pings[i - 1]);
            setLatencyMs(Math.round(avgLatency));
            setJitterMs(Math.round(totalDiff / (pings.length - 1)));
            const uploadSize = 4 * 1024 * 1024;
            const payload = new Uint8Array(uploadSize);
            for (let i = 0; i < uploadSize; i += 65536) crypto.getRandomValues(payload.subarray(i, Math.min(i + 65536, uploadSize)));
            const upStart = performance.now();
            const upRes = await fetch("/api/speedtest", { method: "POST", body: payload });
            if (!upRes.ok) throw new Error("Upload failed");
            setUploadSpeedMbps(Number(((uploadSize * 8) / ((performance.now() - upStart) / 1000 * 1000000)).toFixed(2)));
            const downStart = performance.now();
            const downRes = await fetch("/api/speedtest", { method: "GET" });
            if (!downRes.ok) throw new Error("Download failed");
            const blob = await downRes.blob();
            setDownloadSpeedMbps(Number(((blob.size * 8) / ((performance.now() - downStart) / 1000 * 1000000)).toFixed(2)));
        } catch {
            setUploadSpeedMbps(0); setDownloadSpeedMbps(0); setLatencyMs(null); setJitterMs(null);
        } finally {
            setSpeedTestRunning(false);
        }
    }, []);

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
        setFaceWarning(null);
        setFaceVerified(false);
        faceHistoryRef.current = [];
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
            startFaceDetection();
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
    }, [startVisualizer, startFaceDetection]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        requestPermissions();
        testNetworkSpeed();
        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
            if (faceDetectionAnimRef.current) cancelAnimationFrame(faceDetectionAnimRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
            audioCtxRef.current?.close();
            if (recogRef.current) try { recogRef.current.abort(); } catch { }
        };
    }, []); // mount-only

    // ── Readiness score for progress bar ─────────────────────────────────────
    const checks = [
        cameraStatus === "granted",
        micStatus === "granted" && micVerified,
        faceModelFailed || (faceVerified && !faceWarning),
        noiseBypass || noisePassed,
        speakerStatus === "passed" || speakerStatus === "failed",
        bypassSpeedTest || (uploadSpeedMbps !== null && uploadSpeedMbps >= 3.0 && downloadSpeedMbps !== null && downloadSpeedMbps >= 3.0 && latencyMs !== null && latencyMs < 300),
    ];
    const readyCount = checks.filter(Boolean).length;
    const progressPct = Math.round((readyCount / checks.length) * 100);

    // ── Status helpers ────────────────────────────────────────────────────────
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
                        <p className="text-sm text-gray-500">Hi {candidateName} — let&apos;s make sure everything is set up before we begin.</p>
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

                {/* ── Column 1: Camera ─────────────────────────────────────── */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl flex flex-col relative">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl">
                        <div className="flex items-center gap-2">
                            <Camera className="w-4 h-4 text-gray-600" />
                            <span className="font-medium text-gray-900 text-sm">Camera</span>
                        </div>
                        <StatusIcon ok={cameraStatus === "granted" && (faceModelFailed || faceVerified)} loading={cameraStatus === "requesting"} />
                    </div>

                    {/* Video preview */}
                    <div className="relative bg-gray-950 flex-1 min-h-[300px] overflow-hidden">
                        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                        {cameraStatus !== "granted" && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <Camera className="w-8 h-8 text-gray-500" />
                                <span className="text-xs text-gray-400">
                                    {cameraStatus === "requesting" ? "Requesting access…" : cameraStatus === "denied" ? "Camera denied" : "Camera off"}
                                </span>
                            </div>
                        )}
                        {/* Face detection overlay */}
                        {cameraStatus === "granted" && !faceModelFailed && (
                            <div className="absolute bottom-2 left-2 right-2">
                                <AnimatePresence mode="wait">
                                    {faceWarning ? (
                                        <motion.div key="warn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                            className="bg-orange-500/90 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                            {faceWarning}
                                        </motion.div>
                                    ) : faceVerified ? (
                                        <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                            className="bg-green-500/90 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                                            <CheckCircle2 className="w-3 h-3" />
                                            Face detected
                                        </motion.div>
                                    ) : !faceModelReady ? (
                                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                            className="bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Loading face detection…
                                        </motion.div>
                                    ) : null}
                                </AnimatePresence>
                            </div>
                        )}
                        {snapshotUploading && (
                            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" /> Saving…
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

                {/* ── Column 2: Microphone ──────────────────────────────────── */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl flex flex-col relative">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl">
                        <div className="flex items-center gap-2">
                            <Mic className="w-4 h-4 text-gray-600" />
                            <span className="font-medium text-gray-900 text-sm">Microphone</span>
                        </div>
                        <StatusIcon ok={micStatus === "granted" && micVerified} loading={micStatus === "requesting"} />
                    </div>

                    <div className="px-5 py-4 flex flex-col gap-4 flex-1">
                        {/* Waveform visualizer */}
                        <div className="flex items-end justify-center gap-0.5 h-12 bg-gray-50 rounded-xl px-3">
                            {frequencies.map((v, i) => (
                                <motion.div
                                    key={i}
                                    className={cn("w-1 rounded-full", micVerified ? "bg-green-400" : "bg-orange-400")}
                                    animate={{ height: `${Math.max(3, v * 44)}px` }}
                                    transition={{ duration: 0.05 }}
                                />
                            ))}
                        </div>

                        {/* Verification phrase */}
                        <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 relative group">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-orange-600 font-medium uppercase tracking-wide">Say aloud:</p>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={retryMic}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-white/50 hover:bg-white rounded-md border border-orange-200 text-[10px] font-bold text-orange-600 transition-all"
                                        title="Clear and try again"
                                    >
                                        <RefreshCw className="w-2.5 h-2.5" />
                                        RETRY
                                    </button>
                                    <button 
                                        onClick={refreshPhrase}
                                        className="p-1 hover:bg-orange-100 rounded-full transition-colors text-orange-400 hover:text-orange-600"
                                        title="Try a different phrase"
                                    >
                                        <Activity className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                            <p className="text-sm font-medium text-gray-800 leading-relaxed pr-6 italic">&ldquo;{verifiedPhrase}&rdquo;</p>
                        </div>

                        {/* Live transcript */}
                        <div className="flex-1 min-h-[80px] bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                            {micVerified ? (
                                <div className="flex items-center gap-2 h-full">
                                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                    <span className="text-sm text-green-600 font-medium">Microphone verified!</span>
                                </div>
                            ) : !speechSupported ? (
                                <p className="text-xs text-red-500">Speech recognition not supported in this browser.</p>
                            ) : micStatus !== "granted" ? (
                                <p className="text-xs text-gray-400">Waiting for microphone access…</p>
                            ) : (
                                <div className="flex flex-col gap-1 h-full justify-center">
                                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Hearing you:</p>
                                    <p className="text-sm text-gray-700 leading-relaxed min-h-[1.5rem]">
                                        {liveTranscript || <span className="text-gray-300 italic">Start speaking…</span>}
                                        {interimTranscript && (
                                            <span className="text-gray-400 italic"> {interimTranscript}</span>
                                        )}
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

                {/* ── Column 3: Noise + Speaker + Network ──────────────────── */}
                <div className="flex flex-col gap-4">

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
                            <p className="text-xs text-gray-400 italic">Listening for room noise…</p>
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
                                                No worries — let's try that once more. <br/>Ensure your volume is up 👍
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

                    {/* Network */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Wifi className="w-4 h-4 text-gray-600" />
                                <span className="font-medium text-gray-900 text-sm">Network</span>
                            </div>
                            <StatusIcon
                                ok={bypassSpeedTest || (uploadSpeedMbps !== null && uploadSpeedMbps >= 3.0 && downloadSpeedMbps !== null && downloadSpeedMbps >= 3.0 && latencyMs !== null && latencyMs < 300)}
                                loading={speedTestRunning}
                            />
                        </div>
                        {bypassSpeedTest ? (
                            <p className="text-xs text-gray-400">Skipped</p>
                        ) : speedTestRunning ? (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <Loader2 className="w-3 h-3 animate-spin" /> Testing connection…
                            </div>
                        ) : uploadSpeedMbps !== null ? (
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-gray-50 rounded-lg px-3 py-2">
                                    <p className="text-gray-400 mb-0.5">Download</p>
                                    <p className={cn("font-semibold", (downloadSpeedMbps ?? 0) >= 3 ? "text-green-600" : "text-red-500")}>{downloadSpeedMbps?.toFixed(1)} Mbps</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg px-3 py-2">
                                    <p className="text-gray-400 mb-0.5">Upload</p>
                                    <p className={cn("font-semibold", (uploadSpeedMbps ?? 0) >= 3 ? "text-green-600" : "text-red-500")}>{uploadSpeedMbps?.toFixed(1)} Mbps</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg px-3 py-2">
                                    <p className="text-gray-400 mb-0.5">Latency</p>
                                    <p className={cn("font-semibold", (latencyMs ?? 999) < 300 ? "text-green-600" : "text-red-500")}>{latencyMs} ms</p>
                                </div>
                                {jitterMs !== null && (
                                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                                        <p className="text-gray-400 mb-0.5">Jitter</p>
                                        <p className="font-semibold text-gray-700">{jitterMs} ms</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400">Not tested yet</p>
                        )}
                        {!bypassSpeedTest && uploadSpeedMbps !== null && (uploadSpeedMbps < 3 || (downloadSpeedMbps ?? 0) < 3 || (latencyMs ?? 999) >= 300) && (
                            <div className="mt-2 flex items-center justify-between">
                                <p className="text-xs text-red-500">Connection may affect call quality</p>
                                <button onClick={() => setBypassSpeedTest(true)} className="text-xs text-gray-400 hover:text-gray-600 underline">Proceed anyway</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom CTA */}
            <div className="border-t border-gray-100 px-6 py-5">
                <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-500">
                        {allReady
                            ? "All checks passed — you're ready to begin!"
                            : `${checks.length - readyCount} check${checks.length - readyCount !== 1 ? "s" : ""} remaining`}
                    </div>
                    <button
                        onClick={onComplete}
                        disabled={!allReady || isStarting}
                        className={cn(
                            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all",
                            allReady && !isStarting
                                ? "bg-orange-500 hover:bg-orange-600 text-white shadow-sm"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        )}
                    >
                        {isStarting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</>
                        ) : (
                            <><Zap className="w-4 h-4" /> Begin Interview</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
