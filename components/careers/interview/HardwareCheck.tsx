"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Mic, CheckCircle2, AlertCircle, Loader2, Sparkles, RefreshCw, Volume2, Settings2, Activity, ChevronDown, Monitor, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const VERIFICATION_PHRASES = [
    "I am ready to start the interview",
    "My microphone and camera are working now",
    "I can see and hear everything clearly",
    "The environment is quiet and well-lit",
    "I am looking forward to this conversation",
    "Testing testing one two three",
    "I am in a private and stable space",
    "Let us begin the professional assessment"
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
    const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null); // Must be kept alive — Chrome GCs it otherwise
    const animRef = useRef<number | null>(null);
    const recogRef = useRef<any>(null);
    const verifiedRef = useRef(false);
    const snapshotDoneRef = useRef(false);
    const currentStepRef = useRef(0);

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

    // Pick a random phrase on mount
    useEffect(() => {
        const randomPhrase = VERIFICATION_PHRASES[Math.floor(Math.random() * VERIFICATION_PHRASES.length)];
        setVerifiedPhrase(randomPhrase);
    }, []);

    // Device Selection
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [selectedMicId, setSelectedMicId] = useState('');
    const [isCamDropdownOpen, setIsCamDropdownOpen] = useState(false);
    const [isMicDropdownOpen, setIsMicDropdownOpen] = useState(false);

    const camDropdownRef = useRef<HTMLDivElement>(null);
    const micDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdowns on outside click
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

    // Background Noise (Signal 10)
    const [noiseDb, setNoiseDb] = useState<number | null>(null);
    const [noiseMeasuring, setNoiseMeasuring] = useState(false);
    const [noiseBypass, setNoiseBypass] = useState(false);
    const noisePassed = noiseDb !== null && noiseDb <= 55;

    // Speaker / Audio Playback (Signal 13)
    const [speakerPlaying, setSpeakerPlaying] = useState(false);
    const [speakerStatus, setSpeakerStatus] = useState<"idle" | "playing" | "passed" | "failed">("idle");
    const speakerAudioRef = useRef<HTMLAudioElement | null>(null);

    // Network Speed
    const [uploadSpeedMbps, setUploadSpeedMbps] = useState<number | null>(null);
    const [downloadSpeedMbps, setDownloadSpeedMbps] = useState<number | null>(null);
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const [jitterMs, setJitterMs] = useState<number | null>(null);
    const [speedTestRunning, setSpeedTestRunning] = useState(false);
    const [bypassSpeedTest, setBypassSpeedTest] = useState(false);

    // Face Detection State
    const [faceWarning, setFaceWarning] = useState<string | null>(null);
    const [faceVerified, setFaceVerified] = useState(false);
    const [faceModelReady, setFaceModelReady] = useState(false);
    const [faceModelFailed, setFaceModelFailed] = useState(false);
    const faceDetectorRef = useRef<any>(null);
    const faceDetectionAnimRef = useRef<number | null>(null);
    const lastVideoTimeRef = useRef(-1);
    const faceHistoryRef = useRef<number[]>([]); // To store numFaces over last 5 frames

    // Signal 12 — Browser compatibility
    const [browserSupported, setBrowserSupported] = useState(true);
    const [browserName, setBrowserName] = useState("");

    useEffect(() => {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isAndroid = /Android/.test(ua);
        const isMobile = isIOS || isAndroid;

        // Chrome UA contains "Chrome" and "Safari"
        // Edge UA contains "Chrome", "Safari", and "Edg"
        const isEdge = /Edg/.test(ua);
        const isChrome = /Chrome/.test(ua) && !isEdge && !/OPR|Brave/.test(ua);

        // Final eligibility check
        if (isMobile || (!isChrome && !isEdge)) {
            console.log("[BrowserCheck] UA:", ua);
            setBrowserSupported(false);
            if (isMobile) {
                setBrowserName("Mobile device detected");
            } else if (/Firefox/.test(ua)) {
                setBrowserName("Firefox detected");
            } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
                setBrowserName("Safari detected");
            } else {
                setBrowserName("Unsupported browser");
            }
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
            (latencyMs !== null && latencyMs < 150)
        ));


    // ── Suppress noisy TF Lite / MediaPipe internal logs ─────────────────────
    // The "INFO: Created TensorFlow Lite XNNPACK delegate for CPU" message comes
    // from inside the WASM binary and is surfaced by Next.js/Turbopack as a
    // visible error overlay. We patch console.info to silently drop it.
    useEffect(() => {
        const originalInfo = console.info.bind(console);
        const originalLog = console.log.bind(console);
        const isNoise = (msg: unknown) =>
            typeof msg === "string" && (
                msg.includes("XNNPACK") ||
                msg.includes("TensorFlow Lite") ||
                msg.includes("Created TensorFlow")
            );

        console.info = (...args: unknown[]) => { if (!isNoise(args[0])) originalInfo(...args); };
        console.log = (...args: unknown[]) => { if (!isNoise(args[0])) originalLog(...args); };

        return () => {
            console.info = originalInfo;
            console.log = originalLog;
        };
    }, []);

    // ── MediaPipe Face Landmarker Initialization ─────────────────────────────
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
                if (mounted) {
                    faceDetectorRef.current = detector;
                    setFaceModelReady(true);
                }
            } catch (err) {
                console.error("Face landmarker initialization failed:", err);
                if (mounted) setFaceModelFailed(true);
            }
        };
        loadModel();
        return () => { mounted = false; };
    }, []);


    const startFaceDetection = useCallback(() => {
        const detect = () => {
            // Always re-queue first — no early returns that could kill the loop
            faceDetectionAnimRef.current = requestAnimationFrame(detect);

            const video = videoRef.current;
            if (!video || video.readyState < 2 || !faceDetectorRef.current || video.paused || video.ended) return;
            if (video.currentTime === lastVideoTimeRef.current) return;
            lastVideoTimeRef.current = video.currentTime;

            try {
                const result = faceDetectorRef.current.detectForVideo(video, performance.now());

                // ── Signal 3 & 7: Multi-frame stabilization (3/5 consensus) ──
                const currentNumFaces = (result?.faceLandmarks) ? result.faceLandmarks.length : 0;
                faceHistoryRef.current.push(currentNumFaces);
                if (faceHistoryRef.current.length > 5) faceHistoryRef.current.shift();

                // Wait for full 5-frame buffer before making any decision
                if (faceHistoryRef.current.length < 5) return;

                // Strict majority: a value must appear ≥3 times out of 5
                const counts: Record<number, number> = {};
                faceHistoryRef.current.forEach(n => counts[n] = (counts[n] || 0) + 1);
                const majorityEntry = Object.entries(counts).find(([, c]) => c >= 3);
                if (!majorityEntry) return; // No consensus yet — keep current state, loop continues

                const consensusNumFaces = Number(majorityEntry[0]);

                const setFace = (warning: string | null) => {
                    setFaceWarning(warning);
                    setFaceVerified(warning === null);
                };

                // Signal 3: Face not visible
                if (consensusNumFaces === 0) {
                    setFace("Please position your face in frame");
                    return;
                }

                // Signal 7: More than one person
                if (consensusNumFaces > 1) {
                    setFace("Only one person allowed in frame");
                    return;
                }

                // Single face confirmed — run geometry on the current frame's landmarks
                // If current frame is a noise frame, skip geometry but keep last state
                if (!result?.faceLandmarks || result.faceLandmarks.length !== 1) return;

                const landmarks = result.faceLandmarks[0];
                let minX = 1, maxX = 0, minY = 1, maxY = 0;
                for (const pt of landmarks) {
                    if (pt.x < minX) minX = pt.x;
                    if (pt.x > maxX) maxX = pt.x;
                    if (pt.y < minY) minY = pt.y;
                    if (pt.y > maxY) maxY = pt.y;
                }
                const faceWidth = maxX - minX;
                const faceHeight = maxY - minY;

                // Mirror correction: video is CSS-flipped (scale-x-[-1]) but MediaPipe sees raw frame.
                // Flip cx horizontally so centering matches what the user sees on screen.
                const rawCx = (minX + maxX) / 2;
                const cx = 1 - rawCx;
                const cy = (minY + maxY) / 2;

                // Signal 4: Face centered
                if (cx < 0.35 || cx > 0.65 || cy < 0.25 || cy > 0.55) {
                    setFace("Please center your face on the screen");
                    return;
                }

                // Signal 5: Face size
                if (faceWidth < 0.20) {
                    setFace("Please move closer to the camera");
                    return;
                }
                if (faceWidth > 0.55) {
                    setFace("Please move slightly back");
                    return;
                }

                // Signal 6: Perceptual lighting check via canvas pixel sampling
                const canvas = document.createElement('canvas');
                canvas.width = 30; canvas.height = 30;
                const ctx = canvas.getContext('2d');
                if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) {
                    setFace(null); // Can't sample, assume OK
                    return;
                }
                ctx.drawImage(
                    video,
                    Math.max(0, minX * video.videoWidth),
                    Math.max(0, minY * video.videoHeight),
                    Math.min(faceWidth * video.videoWidth, video.videoWidth),
                    Math.min(faceHeight * video.videoHeight, video.videoHeight),
                    0, 0, 30, 30
                );
                const imgData = ctx.getImageData(0, 0, 30, 30);
                let totalLuminance = 0;
                for (let i = 0; i < imgData.data.length; i += 4) {
                    const r = imgData.data[i], g = imgData.data[i + 1], b = imgData.data[i + 2];
                    totalLuminance += Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
                }
                const avgBrightness = totalLuminance / 900; // 30×30 = 900 pixels
                if (avgBrightness < 70) {
                    setFace("Environment is too dark. Increase lighting.");
                } else if (avgBrightness > 200) {
                    setFace("Environment is too bright (reduce backlight).");
                } else {
                    setFace(null); // All signals passed ✓
                }
            } catch (e) {
                // ignore transient MediaPipe errors
            }
        };
        faceDetectionAnimRef.current = requestAnimationFrame(detect);
    }, []);

    // ── Upload snapshot ──────────────────────────────────────────────────────
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
            console.log("[HardwareCheck] Snapshot upload result:", resBody);
            if (resBody.status === "queued" || resBody.url) {
                snapshotDoneRef.current = true;
                console.log("[HardwareCheck] Snapshot queued successfully.");
            } else {
                console.error("[HardwareCheck] Snapshot upload failed - invalid response:", resBody);
            }
        } catch (err) {
            console.error("[HardwareCheck] Snapshot upload error:", err);
        } finally {
            setSnapshotUploading(false);
        }
    }, [candidateName, applicationId]);

    // ── Speech detection ─────────────────────────────────────────────────────
    useEffect(() => {
        if (micStatus !== "granted" || verifiedRef.current) return;

        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            setSpeechSupported(false);
            return;
        }

        const r = new SR();
        r.continuous = true;
        r.interimResults = true;
        r.lang = "en-US";
        recogRef.current = r;

        r.onresult = (event: any) => {
            if (verifiedRef.current) return;
            const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
            const targetPhrase = verifiedPhrase.toLowerCase();

            // Strict phrase match: transcript must contain the full target phrase
            if (targetPhrase && transcript.includes(targetPhrase)) {
                verifiedRef.current = true;
                setMicVerified(true);
                setActiveStep(1);
                try { r.stop(); } catch { }
            }
        };

        r.onend = () => {
            if (!verifiedRef.current && recogRef.current === r) {
                setTimeout(() => { if (!verifiedRef.current) try { r.start(); } catch { } }, 250);
            }
        };

        try { r.start(); } catch { }

        return () => {
            if (recogRef.current === r) {
                try { r.abort(); } catch { }
                recogRef.current = null;
            }
        };
    }, [micStatus, verifiedPhrase]);

    // ── Audio visualizer ─────────────────────────────────────────────────────
    const startVisualizer = useCallback(() => {
        const tick = () => {
            if (!analyzerRef.current) return;
            const b = new Uint8Array(analyzerRef.current.frequencyBinCount);
            analyzerRef.current.getByteFrequencyData(b);
            const bars = 40;
            const bin = Math.floor(b.length / bars);
            setFrequencies(Array.from({ length: bars }, (_, i) => {
                let s = 0;
                for (let j = 0; j < bin; j++) s += b[i * bin + j];
                return s / bin / 255;
            }));
            animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);
    }, []);

    // ── Signal 10: Background Noise Floor Measurement ────────────────────────
    // Samples ambient audio for 2.5s BEFORE the candidate speaks.
    // Uses RMS of time-domain samples → converts to dB: 20*log10(rms/255)
    const measureNoiseFloor = useCallback(async () => {
        if (!analyzerRef.current) return;
        setNoiseMeasuring(true);
        setNoiseDb(null);

        const analyzer = analyzerRef.current;
        analyzer.fftSize = 2048;
        const bufferLength = analyzer.fftSize;
        const buffer = new Uint8Array(bufferLength);

        const DURATION_MS = 2500; // 2.5 seconds of ambient silence
        const INTERVAL_MS = 50;   // sample every 50ms → ~50 samples
        const samples: number[] = [];
        const start = performance.now();

        await new Promise<void>(resolve => {
            const sample = () => {
                analyzer.getByteTimeDomainData(buffer);
                // RMS of time-domain signal (values are 0–255, silence = 128)
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const v = buffer[i] - 128; // centre around 0
                    sum += v * v;
                }
                const rms = Math.sqrt(sum / bufferLength);
                // Convert to dB: silence rms≈0 → -∞, loud → 0dB
                // Use max(rms, 0.5) to avoid log(0)
                const db = 20 * Math.log10(Math.max(rms, 0.5) / 128);
                // Remap to SPL-like scale: 0dB here ≈ 94dB SPL, shift by +94
                samples.push(db + 94);

                if (performance.now() - start < DURATION_MS) {
                    setTimeout(sample, INTERVAL_MS);
                } else {
                    resolve();
                }
            };
            setTimeout(sample, INTERVAL_MS);
        });

        // Take the 90th-percentile sample as the noise floor (ignores brief quiet gaps)
        const sorted = [...samples].sort((a, b) => a - b);
        const p90 = sorted[Math.floor(sorted.length * 0.9)];
        setNoiseDb(Math.round(p90));
        setNoiseMeasuring(false);
    }, []);

    // ── Signal 13: Speaker / Audio Playback Test ──────────────────────────────
    // Plays a short 440Hz tone via Web Audio API. Candidate must confirm they
    // heard it. Failure path explicitly tells them to check their output device.
    const playSpeakerTest = useCallback(() => {
        setSpeakerStatus("playing");
        setSpeakerPlaying(true);

        const scheduleAudio = (actx: AudioContext) => {
            const oscillator = actx.createOscillator();
            const gain = actx.createGain();
            oscillator.connect(gain);
            gain.connect(actx.destination);
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(440, actx.currentTime);
            gain.gain.setValueAtTime(0, actx.currentTime);
            gain.gain.linearRampToValueAtTime(0.6, actx.currentTime + 0.05);
            gain.gain.linearRampToValueAtTime(0.6, actx.currentTime + 1.3);
            gain.gain.linearRampToValueAtTime(0, actx.currentTime + 1.6);
            oscillator.start(actx.currentTime);
            oscillator.stop(actx.currentTime + 1.6);
            oscillator.onended = () => { setSpeakerPlaying(false); };
        };

        // Reuse the already-unlocked mic AudioContext if available.
        // Creating a new AudioContext on each Play click is unreliable because
        // Chrome may have exhausted its gesture quota by this point.
        const existingCtx = audioCtxRef.current;
        if (existingCtx && existingCtx.state !== 'closed') {
            if (existingCtx.state === 'suspended') {
                existingCtx.resume()
                    .then(() => scheduleAudio(existingCtx))
                    .catch(() => setSpeakerPlaying(false));
            } else {
                scheduleAudio(existingCtx);
            }
            return;
        }

        // Fallback: create a fresh context (only if mic context was never set up)
        try {
            const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (actx.state === 'suspended') {
                actx.resume().then(() => scheduleAudio(actx)).catch(() => setSpeakerPlaying(false));
            } else {
                scheduleAudio(actx);
            }
        } catch {
            setSpeakerPlaying(false);
        }
    }, []);

    const testNetworkSpeed = useCallback(async () => {
        setSpeedTestRunning(true);
        try {
            // PHASE 1: Latency & Jitter (10 samples)
            const pings = [];
            for (let i = 0; i < 10; i++) {
                const start = performance.now();
                await fetch("/api/speedtest", { method: "POST", headers: { "Content-Length": "0" } });
                pings.push(performance.now() - start);
                // Tiny delay between pings to avoid TCP burst interference
                await new Promise(r => setTimeout(r, 50));
            }
            const avgLatency = pings.reduce((a, b) => a + b, 0) / pings.length;

            // Industry Standard Jitter: Average of absolute differences between successive samples
            let totalDiff = 0;
            for (let i = 1; i < pings.length; i++) {
                totalDiff += Math.abs(pings[i] - pings[i - 1]);
            }
            const jitter = totalDiff / (pings.length - 1);

            setLatencyMs(Math.round(avgLatency));
            setJitterMs(Math.round(jitter));

            // PHASE 2: Sustained Upload (4MB payload)
            const uploadSize = 4 * 1024 * 1024; // 4MB
            const payload = new Uint8Array(uploadSize);
            // getRandomValues limit is 65536 bytes per call — fill in chunks
            for (let i = 0; i < uploadSize; i += 65536) {
                crypto.getRandomValues(payload.subarray(i, Math.min(i + 65536, uploadSize)));
            }

            const upStart = performance.now();
            const upRes = await fetch("/api/speedtest", { method: "POST", body: payload });
            if (!upRes.ok) throw new Error("Upload failed");
            const upEnd = performance.now();

            const upDurationSec = (upEnd - upStart) / 1000;
            const upMbps = (uploadSize * 8) / (upDurationSec * 1000000);
            setUploadSpeedMbps(Number(upMbps.toFixed(2)));

            // PHASE 3: Sustained Download
            const downStart = performance.now();
            const downRes = await fetch("/api/speedtest", { method: "GET" });
            if (!downRes.ok) throw new Error("Download failed");
            const blob = await downRes.blob();
            const downEnd = performance.now();

            const downDurationSec = (downEnd - downStart) / 1000;
            const downMbps = (blob.size * 8) / (downDurationSec * 1000000);
            setDownloadSpeedMbps(Number(downMbps.toFixed(2)));

        } catch (e) {
            console.error("[NetworkTestFail]:", e);
            setUploadSpeedMbps(0);
            setDownloadSpeedMbps(0);
            setLatencyMs(null);
            setJitterMs(null);
        } finally {
            setSpeedTestRunning(false);
        }
    }, []);

    const requestPermissions = useCallback(async (cameraId?: string, micId?: string) => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }

        setError(null);
        setCameraStatus("requesting");
        setMicStatus("requesting");
        setMicVerified(false);
        setActiveStep(0);
        currentStepRef.current = 0;
        verifiedRef.current = false;
        snapshotDoneRef.current = false;
        setSnapshotUrl(null);
        // Reset face detection state for fresh attempt
        setFaceWarning(null);
        setFaceVerified(false);
        faceHistoryRef.current = [];
        // Reset noise measurement for fresh attempt
        setNoiseDb(null);
        setNoiseMeasuring(false);
        setNoiseBypass(false);
        // Reset speaker test
        setSpeakerStatus("idle");
        setSpeakerPlaying(false);
        if (speakerAudioRef.current) {
            speakerAudioRef.current.pause();
            speakerAudioRef.current = null;
        }

        try {
            const constraints: MediaStreamConstraints = {
                // Note: removed facingMode:"user" — can conflict with deviceId on desktops
                // and cause silent broken streams on single-camera setups
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
                    try {
                        await videoRef.current.play();
                        console.log("[HardwareCheck] ✅ Video playing, paused:", videoRef.current.paused);
                    } catch (err: any) {
                        console.error("[HardwareCheck] ❌ play() failed:", err?.name, err?.message);
                    }
                };

                // Strategy 1: immediate play
                await playVideo();

                // Strategy 2: onloadedmetadata fallback (fires if stream wasn't ready yet)
                if (videoRef.current.paused) {
                    console.warn("[HardwareCheck] Video still paused after play() — setting onloadedmetadata fallback");
                    videoRef.current.onloadedmetadata = playVideo;
                }
            }
            setCameraStatus("granted");
            startFaceDetection();

            // Create AudioContext. Chrome suspends new contexts until a user gesture.
            // We force-resume it immediately, then add a one-time unlock listener
            // so the visualizer starts working as soon as the user first interacts.
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioCtxRef.current = ctx;

            const unlockCtx = () => {
                if (ctx.state === 'suspended') {
                    ctx.resume().catch(() => {});
                }
                document.removeEventListener('click', unlockCtx);
                document.removeEventListener('keydown', unlockCtx);
            };
            document.addEventListener('click', unlockCtx);
            document.addEventListener('keydown', unlockCtx);

            // Attempt immediate resume — succeeds if a gesture already happened
            await ctx.resume().catch(() => {});

            const analyzer = ctx.createAnalyser();
            analyzer.fftSize = 512;
            // CRITICAL: Store the source node in a ref. Chrome's GC will destroy
            // it if it's only a local variable, silently disconnecting the audio graph.
            const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
            micSourceRef.current = source;
            source.connect(analyzer);
            analyzerRef.current = analyzer;
            console.log("[Audio] Context state:", ctx.state, "| Tracks:", stream.getAudioTracks().length);
            setMicStatus("granted");
            startVisualizer();
            // Measure ambient noise floor for 2.5s right after mic granted,
            // before the candidate starts speaking the phrase
            setTimeout(() => measureNoiseFloor(), 300);
        } catch (err: any) {
            setCameraStatus("denied");
            setMicStatus("denied");
            console.error("[HardwareCheck] Permission error:", err?.name, err?.message);
            setError("Could not access camera or microphone. Please check browser permissions.");
        }
    }, [startVisualizer, startFaceDetection, measureNoiseFloor]);

    // Empty deps: run exactly once on mount.
    // requestPermissions is NOT in deps — including it creates a loop:
    // useCallback recreates fn → effect re-runs → calls requestPermissions again → resets cameraStatus to 'requesting'
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
    }, []); // ← intentionally empty: mount-only

    return (
        <div className="w-full min-h-screen bg-white overflow-y-auto overflow-x-hidden selection:bg-orange-100">
            <div className="flex flex-col items-center py-12 px-4 min-h-full">
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="w-full max-w-6xl space-y-6"
            >
                {/* Header */}
                <div className="text-center space-y-2">

                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{title}</h1>
                    <p className="text-gray-500 font-medium">Verify your camera and microphone before the interview begins</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">

                    {/* ── Left: Camera ── */}
                    <div className="space-y-3">
                        <div className="relative aspect-[4/3] bg-gray-100 rounded-3xl overflow-hidden border border-gray-200 shadow-xl">
                            {/* Static placeholder — sits behind video at z-0.
                                Never conditionally removed so there's no layout shift. */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-50 z-0">
                                <div className="p-5 bg-white rounded-2xl border border-gray-100">
                                    <Camera className={cn("w-10 h-10",
                                        cameraStatus === "denied" ? "text-red-400" : "text-gray-300 animate-pulse"
                                    )} />
                                </div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    {cameraStatus === "denied" ? "Camera required" : "Starting camera..."}
                                </p>
                            </div>

                            {/* Video — always at z-10. Multi-event play strategy for browser compatibility. */}
                            <div className="absolute inset-0 z-10" style={{ transform: 'scaleX(-1)' }}>
                                <video
                                    ref={videoRef}
                                    autoPlay muted playsInline
                                    className="w-full h-full object-cover"
                                    onLoadedMetadata={(e) => {
                                        const v = e.currentTarget;
                                        v.muted = true;
                                        v.play().catch(console.error);
                                    }}
                                    onCanPlay={(e) => {
                                        e.currentTarget.play().catch(console.error);
                                    }}
                                />
                            </div>

                            {/* FACE DETECTION WARNING */}
                            {/* Loading pill while MediaPipe model initializes */}
                            <AnimatePresence>
                                {cameraStatus === "granted" && !faceModelReady && !faceModelFailed && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10"
                                    >
                                        <div className="flex items-center gap-2 px-3 py-2 bg-black/60 text-white rounded-xl backdrop-blur-md border border-white/10">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                            <p className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap">Loading face detection...</p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Face warning pill — only shown after model is ready */}
                            <AnimatePresence>
                                {cameraStatus === "granted" && faceModelReady && faceWarning && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 w-[80%]"
                                    >
                                        <div className="flex items-center gap-2 px-3 py-2 bg-red-600/90 text-white rounded-xl shadow-[0_8px_32px_rgba(220,38,38,0.4)] backdrop-blur-md border border-white/20 animate-pulse">
                                            <AlertCircle className="w-4 h-4 shrink-0" />
                                            <p className="text-[11px] font-black uppercase tracking-widest text-center leading-tight">
                                                {faceWarning}
                                            </p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* LIVE badge */}
                            {cameraStatus === "granted" && (
                                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                    <span className="text-[9px] font-black text-white uppercase tracking-widest">Live</span>
                                </div>
                            )}

                            {/* Snapshot thumbnail */}
                            <AnimatePresence>
                                {snapshotUrl && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.7 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="absolute bottom-3 right-3 w-14 h-14 rounded-xl overflow-hidden border-2 border-green-400 shadow-xl"
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={snapshotUrl} alt="snapshot" className="w-full h-full object-cover scale-x-[-1]" />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                            {snapshotUploading
                                                ? <Loader2 className="w-3 h-3 text-white animate-spin" />
                                                : <CheckCircle2 className="w-3 h-3 text-green-400" />}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Visualizer bars at bottom of video */}
                            {micStatus === "granted" && (
                                <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-[2px] px-3 pb-3 h-12 bg-gradient-to-t from-black/50 to-transparent">
                                    {frequencies.map((f, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{ height: `${Math.max(2, f * 40)}px` }}
                                            transition={{ type: "spring", stiffness: 800, damping: 35 }}
                                            className={cn("w-[2px] rounded-full", micVerified ? "bg-green-400" : "bg-[#F97316]")}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        <p className={cn("text-center text-xs font-medium",
                            !faceModelReady && !faceModelFailed ? "text-gray-400" :
                                faceWarning ? "text-red-500 animate-pulse font-bold" :
                                    faceVerified ? "text-green-600 font-bold" : "text-gray-400"
                        )}>
                            {!faceModelReady && !faceModelFailed
                                ? "Loading face detection model..."
                                : faceModelFailed
                                    ? "Face detection unavailable — proceeding without it"
                                    : faceWarning
                                        ? faceWarning
                                        : faceVerified
                                            ? "✓ Face verified"
                                            : "Ensure your face is clearly visible and well-lit"}
                        </p>

                        {/* Camera status badge — reflects BOTH camera permission AND face detection state */}
                        <div className={cn(
                            "flex items-center gap-3 p-4 rounded-2xl border transition-all",
                            cameraStatus === "denied" ? "bg-red-50 border-red-100" :
                                cameraStatus === "granted" && faceVerified ? "bg-green-50 border-green-100" :
                                    cameraStatus === "granted" ? "bg-amber-50 border-amber-100" :
                                        "bg-white border-gray-100 shadow-sm"
                        )}>
                            <div className={cn("p-2 rounded-xl",
                                cameraStatus === "denied" ? "bg-red-500 text-white" :
                                    cameraStatus === "granted" && faceVerified ? "bg-green-500 text-white" :
                                        cameraStatus === "granted" ? "bg-amber-500 text-white" :
                                            "bg-gray-100 text-gray-400"
                            )}>
                                <Camera className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Camera</p>
                                <p className={cn("text-xs font-bold",
                                    cameraStatus === "denied" ? "text-red-700" :
                                        cameraStatus === "granted" && faceVerified ? "text-green-700" :
                                            cameraStatus === "granted" && faceWarning ? "text-amber-700" :
                                                cameraStatus === "granted" ? "text-amber-700" :
                                                    "text-gray-400"
                                )}>
                                    {cameraStatus === "denied" ? "Access Denied" :
                                        cameraStatus === "granted" && faceVerified ? "✓ Face Verified" :
                                            cameraStatus === "granted" && faceWarning ? faceWarning :
                                                cameraStatus === "granted" && faceModelReady ? "Position your face" :
                                                    cameraStatus === "granted" ? "Detecting..." :
                                                        "Requesting..."}
                                </p>
                            </div>

                            {/* PREMIUM CAMERA SELECTOR */}
                            {devices.length > 0 && cameraStatus === "granted" && (
                                <div className="relative" ref={camDropdownRef}>
                                    <button
                                        onClick={() => setIsCamDropdownOpen(!isCamDropdownOpen)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-100 hover:border-orange-200 transition-all rounded-xl shadow-sm group"
                                    >
                                        <Monitor className="w-3.5 h-3.5 text-gray-400 group-hover:text-orange-500" />
                                        <span className="text-[11px] font-bold text-gray-600 truncate max-w-[80px]">
                                            {devices.find(d => d.deviceId === selectedCameraId)?.label || "Camera"}
                                        </span>
                                        <ChevronDown className={cn("w-3 h-3 text-gray-400 transition-transform", isCamDropdownOpen && "rotate-180")} />
                                    </button>

                                    <AnimatePresence>
                                        {isCamDropdownOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                                className="absolute bottom-full mb-2 right-0 w-64 bg-white border border-gray-100 rounded-2xl shadow-2xl p-2 z-50 ring-4 ring-black/5"
                                            >
                                                <div className="px-3 py-2 border-b border-gray-50 mb-1">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Available Cameras</p>
                                                </div>
                                                {devices.filter(d => d.kind === "videoinput").map(d => (
                                                    <button
                                                        key={d.deviceId}
                                                        onClick={() => {
                                                            setSelectedCameraId(d.deviceId);
                                                            requestPermissions(d.deviceId, selectedMicId);
                                                            setIsCamDropdownOpen(false);
                                                        }}
                                                        className={cn(
                                                            "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all",
                                                            selectedCameraId === d.deviceId ? "bg-orange-50 text-[#F97316]" : "hover:bg-gray-50 text-gray-600"
                                                        )}
                                                    >
                                                        <div className={cn("p-1.5 rounded-lg", selectedCameraId === d.deviceId ? "bg-orange-100" : "bg-gray-100")}>
                                                            <Camera className="w-3.5 h-3.5" />
                                                        </div>
                                                        <span className="text-xs font-bold truncate">{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</span>
                                                        {selectedCameraId === d.deviceId && <CheckCircle2 className="w-3 h-3 ml-auto" />}
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {micVerified && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                        </div>


                    </div>

                    {/* ── Right: Mic + Checks ── */}
                    <div className="flex flex-col gap-3">
                        {/* Phrase verification card */}
                        <div className={cn(
                            "rounded-2xl border p-5 flex flex-col gap-4 transition-all duration-300",
                            micVerified ? "bg-green-50 border-green-200" : "bg-white border-gray-200 shadow-sm"
                        )}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Microphone Test</p>
                                    <p className="text-sm font-bold text-gray-800 mt-0.5">
                                        {speechSupported ? "Please say the phrase below:" : "Voice recognition not supported."}
                                    </p>
                                </div>
                                {micVerified && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />}
                            </div>

                            {speechSupported ? (
                                <motion.div
                                    animate={{ borderColor: micVerified ? "#22c55e" : "#F97316" }}
                                    className={cn(
                                        "p-5 rounded-xl border-2 flex items-center justify-center text-center",
                                        micVerified ? "bg-white border-green-400" : "bg-orange-50/40 border-orange-300/40"
                                    )}
                                >
                                    <p className={cn("text-xl font-black leading-tight", micVerified ? "text-green-700" : "text-gray-900")}>
                                        "{verifiedPhrase || "Loading phrase..."}"
                                    </p>
                                </motion.div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            verifiedRef.current = true;
                                            setMicVerified(true);
                                            setActiveStep(1);
                                        }}
                                        disabled={micVerified}
                                        className={cn(
                                            "h-14 px-8 rounded-2xl font-black uppercase tracking-widest transition-all",
                                            micVerified
                                                ? "bg-green-500 text-white border-green-500 opacity-100 hover:bg-green-500"
                                                : "bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100"
                                        )}
                                    >
                                        {micVerified ? (
                                            <span className="flex items-center gap-2">Verified <CheckCircle2 className="w-5 h-5" /></span>
                                        ) : (
                                            "Click to Verify"
                                        )}
                                    </Button>
                                </div>
                            )}

                            <div className="flex justify-center items-center gap-2">
                                <Volume2 className={cn("w-4 h-4", micVerified ? "text-green-500" : "text-orange-400 animate-pulse")} />
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                    {micVerified ? "Voice Sync Complete" : (speechSupported ? "Waiting for audio..." : "Click button to verify audio")}
                                </p>
                            </div>
                        </div>

                        {/* ── Checklist: Mic + Noise + Speaker ── */}
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm divide-y divide-gray-100">

                            {/* Row: Microphone access + device selector */}
                            <div className="flex items-center gap-3 px-4 py-3">
                                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                                    micVerified ? "bg-green-500" : micStatus === "denied" ? "bg-red-500" : "bg-gray-100"
                                )}>
                                    {micVerified ? <CheckCircle2 className="w-4 h-4 text-white" /> :
                                        micStatus === "denied" ? <AlertCircle className="w-4 h-4 text-white" /> :
                                            <Mic className="w-3.5 h-3.5 text-gray-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800">Microphone</p>
                                    <p className="text-[11px] text-gray-400 truncate">
                                        {micVerified ? "Voice verified" : micStatus === "granted" ? "Say the phrase above..." : micStatus === "denied" ? "Access denied" : "Requesting..."}
                                    </p>
                                </div>
                                {/* Mic selection dropdown */}
                                {devices.filter(d => d.kind === "audioinput").length > 0 && micStatus === "granted" && (
                                    <div className="relative shrink-0" ref={micDropdownRef}>
                                        <button onClick={() => setIsMicDropdownOpen(!isMicDropdownOpen)}
                                            className="flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-semibold text-gray-500 hover:border-orange-200 hover:text-orange-500 transition-all">
                                            <span className="max-w-[70px] truncate">{devices.find(d => d.deviceId === selectedMicId)?.label?.split(" ")[0] || "Mic"}</span>
                                            <ChevronDown className={cn("w-3 h-3 transition-transform", isMicDropdownOpen && "rotate-180")} />
                                        </button>
                                        <AnimatePresence>
                                            {isMicDropdownOpen && (
                                                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                                                    className="absolute bottom-full mb-1 right-0 w-56 bg-white border border-gray-200 rounded-xl shadow-xl p-1.5 z-50">
                                                    {devices.filter(d => d.kind === "audioinput").map(d => (
                                                        <button key={d.deviceId} onClick={() => { setSelectedMicId(d.deviceId); requestPermissions(selectedCameraId, d.deviceId); setIsMicDropdownOpen(false); }}
                                                            className={cn("w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2",
                                                                selectedMicId === d.deviceId ? "bg-orange-50 text-orange-600" : "text-gray-600 hover:bg-gray-50")}>
                                                            {selectedMicId === d.deviceId && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                                                            <span className="truncate">{d.label || `Mic ${d.deviceId.slice(0, 5)}`}</span>
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </div>

                            {/* Row: Background noise */}
                            <div className="flex items-center gap-3 px-4 py-3">
                                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                                    noiseMeasuring ? "bg-gray-100" : noisePassed ? "bg-green-500" : noiseDb !== null ? "bg-red-500" : "bg-gray-100"
                                )}>
                                    {noiseMeasuring ? <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" /> :
                                        noisePassed ? <CheckCircle2 className="w-4 h-4 text-white" /> :
                                            noiseDb !== null ? <AlertCircle className="w-4 h-4 text-white" /> :
                                                <AudioLines className="w-3.5 h-3.5 text-gray-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800">Background Noise</p>
                                    <p className={cn("text-[11px]", noisePassed ? "text-green-600" : noiseDb !== null && !noiseMeasuring ? "text-red-500" : "text-gray-400")}>
                                        {noiseMeasuring ? "Measuring..." : noiseDb === null ? "Waiting for mic..." :
                                            noisePassed ? `Quiet (${noiseDb} dB)` : `Too noisy — ${noiseDb} dB (limit 55 dB)`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {noiseDb !== null && !noiseMeasuring && (
                                        <button onClick={() => measureNoiseFloor()} title="Re-measure"
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
                                            <RefreshCw className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    {!noisePassed && noiseDb !== null && !noiseMeasuring && !noiseBypass && (
                                        <button onClick={() => setNoiseBypass(true)}
                                            className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 transition-all">
                                            Skip
                                        </button>
                                    )}
                                    {noiseBypass && <span className="text-[10px] font-semibold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Skipped</span>}
                                </div>
                            </div>

                            {/* Row: Speaker test */}
                            <div className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                                        speakerStatus === "passed" ? "bg-green-500" : speakerStatus === "failed" ? "bg-red-500" :
                                            speakerStatus === "playing" ? "bg-orange-100" : "bg-gray-100"
                                    )}>
                                        {speakerStatus === "passed" ? <CheckCircle2 className="w-4 h-4 text-white" /> :
                                            speakerStatus === "failed" ? <AlertCircle className="w-4 h-4 text-white" /> :
                                                speakerStatus === "playing" ? <Volume2 className="w-3.5 h-3.5 text-orange-500 animate-pulse" /> :
                                                    <Volume2 className="w-3.5 h-3.5 text-gray-400" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-gray-800">Speaker / Audio Output</p>
                                        <p className={cn("text-[11px]",
                                            speakerStatus === "passed" ? "text-green-600" : speakerStatus === "failed" ? "text-red-500" :
                                                speakerStatus === "playing" ? "text-orange-500" : "text-gray-400")}>
                                            {speakerStatus === "idle" && "Play a tone to verify your speakers"}
                                            {speakerStatus === "playing" && "Playing — listen for the tone..."}
                                            {speakerStatus === "passed" && "Audio confirmed"}
                                            {speakerStatus === "failed" && "No audio — check output device"}
                                        </p>
                                    </div>
                                    {/* Play / replay button */}
                                    {speakerStatus !== "playing" && (
                                        <button onClick={playSpeakerTest}
                                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F97316] text-white text-[11px] font-bold hover:bg-orange-600 transition-all shadow-sm">
                                            <Volume2 className="w-3 h-3" />
                                            {speakerStatus === "idle" ? "Play" : "Replay"}
                                        </button>
                                    )}
                                </div>

                                {/* Confirm buttons — appear after tone plays */}
                                {(speakerStatus === "playing" || speakerStatus === "passed" || speakerStatus === "failed") && !speakerPlaying && (
                                    <div className="flex gap-2 mt-2.5 ml-10">
                                        <button onClick={() => setSpeakerStatus("passed")}
                                            className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold border transition-all",
                                                speakerStatus === "passed" ? "bg-green-500 text-white border-green-500" : "bg-white text-green-700 border-green-200 hover:bg-green-50")}>
                                            <CheckCircle2 className="w-3.5 h-3.5" /> I Heard It
                                        </button>
                                        <button onClick={() => setSpeakerStatus("failed")}
                                            className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold border transition-all",
                                                speakerStatus === "failed" ? "bg-red-500 text-white border-red-500" : "bg-white text-red-600 border-red-200 hover:bg-red-50")}>
                                            <AlertCircle className="w-3.5 h-3.5" /> Didn't Hear It
                                        </button>
                                    </div>
                                )}

                                {/* Failure guidance */}
                                {speakerStatus === "failed" && (
                                    <div className="mt-2.5 ml-10 p-3 bg-red-50 rounded-xl border border-red-100">
                                        <p className="text-[11px] text-red-700 leading-relaxed">
                                            Go to your system <span className="font-bold">Sound Settings</span> and set the correct speaker or headphones as the default output, then click <span className="font-bold">Replay</span>.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Column 3: Network Quality Card ── */}
                    <div className={cn(
                        "flex flex-col gap-4 p-5 rounded-3xl border transition-all duration-500 lg:sticky lg:top-6",
                        speedTestRunning ? "bg-white border-gray-100 animate-pulse" :
                            uploadSpeedMbps !== null && uploadSpeedMbps >= 3
                                ? "bg-green-50/50 border-green-100 shadow-[0_8px_16px_rgba(34,197,94,0.05)]"
                                : "bg-red-50/50 border-red-100 shadow-[0_8px_16px_rgba(239,68,68,0.05)]"
                    )}>
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-3 rounded-2xl shadow-sm transition-all duration-500",
                                speedTestRunning ? "bg-gray-100 text-gray-300" :
                                    uploadSpeedMbps !== null && uploadSpeedMbps >= 3 ? "bg-green-500 text-white" : "bg-red-500 text-white"
                            )}>
                                {speedTestRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5" />}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">Connection Quality</p>
                                    {uploadSpeedMbps !== null && !speedTestRunning && (
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                                            uploadSpeedMbps >= 5 ? "bg-green-100 text-green-700" :
                                                uploadSpeedMbps >= 3 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                                        )}>
                                            {uploadSpeedMbps >= 5 ? "Excellent" : uploadSpeedMbps >= 3 ? "Good" : "Unstable"}
                                        </span>
                                    )}
                                </div>
                                <h4 className={cn("text-lg font-black tracking-tight", speedTestRunning ? "text-gray-400" : uploadSpeedMbps !== null && uploadSpeedMbps >= 3.0 ? "text-gray-900" : "text-red-700")}>
                                    {speedTestRunning ? "Analyzing stability..." : uploadSpeedMbps !== null ? "Network Ready" : "Test Failed"}
                                </h4>
                            </div>
                        </div>

                        {!speedTestRunning && (
                            <div className="flex items-center gap-3 pt-1">
                                <button
                                    onClick={testNetworkSpeed}
                                    className="h-8 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border border-gray-100 bg-white hover:bg-orange-50 hover:text-[#F97316] hover:border-orange-100 transition-all flex items-center shadow-sm"
                                >
                                    <RefreshCw className="w-3 h-3 mr-2" />
                                    Retry
                                </button>
                                {uploadSpeedMbps !== null && uploadSpeedMbps >= 3.0 && downloadSpeedMbps !== null && downloadSpeedMbps >= 3.0 && latencyMs !== null && latencyMs < 150 && (
                                    <span className="flex items-center gap-1.5 px-3 py-1 bg-green-500 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg shadow-green-500/20 animate-in fade-in zoom-in duration-500">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Verified
                                    </span>
                                )}
                                {/* SOFT BYPASS: Allow candidates with suboptimal but working bandwidth to proceed */}
                                {!bypassSpeedTest && uploadSpeedMbps !== null && (uploadSpeedMbps < 3.0 || downloadSpeedMbps! < 3.0 || (latencyMs || 0) > 150) && uploadSpeedMbps > 0.5 && (
                                    <button
                                        onClick={() => setBypassSpeedTest(true)}
                                        className="h-8 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-all border-dashed"
                                    >
                                        Bypass Warning
                                    </button>
                                )}
                            </div>
                        )}

                        {!speedTestRunning && uploadSpeedMbps !== null && (
                            <div className="grid grid-cols-2 gap-4 mt-2 pt-4 border-t border-gray-100">
                                <div className="flex flex-col">
                                    <p className="text-[9px] font-black uppercase text-gray-400">Download</p>
                                    <p className="text-sm font-bold text-gray-700">{downloadSpeedMbps} Mbps</p>
                                </div>
                                <div className="flex flex-col">
                                    <p className="text-[9px] font-black uppercase text-gray-400">Upload</p>
                                    <p className="text-sm font-bold text-gray-700">{uploadSpeedMbps} Mbps</p>
                                </div>
                                <div className="flex flex-col">
                                    <p className="text-[9px] font-black uppercase text-gray-400">Latency</p>
                                    <p className="text-sm font-bold text-gray-700">{latencyMs} ms</p>
                                </div>
                                <div className="flex flex-col">
                                    <p className="text-[9px] font-black uppercase text-gray-400">Jitter</p>
                                    <p className={cn("text-sm font-bold", (jitterMs || 0) > 30 ? "text-orange-500" : "text-gray-700")}>{jitterMs} ms</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                    {/* Error banner */}
                    <AnimatePresence>
                        {(error || errorMessage) && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3"
                            >
                                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                <p className="text-[12px] text-red-700 font-medium leading-relaxed flex-1">{error || errorMessage}</p>
                                <button onClick={() => requestPermissions(selectedCameraId, selectedMicId)} className="text-red-400 hover:text-red-600 transition-colors shrink-0">
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                {/* CTA Button */}
                <Button
                    onClick={async () => {
                        await uploadSnapshot("interview_start");
                        onComplete();
                    }}
                    disabled={!allReady || isStarting || !browserSupported}
                    className={cn(
                        "w-full h-14 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300",
                        allReady && browserSupported
                            ? "bg-[#F97316] hover:bg-orange-600 text-white shadow-[0_10px_30px_rgba(249,115,22,0.3)] active:scale-95"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}
                >
                    {isStarting ? (
                        <span className="flex items-center justify-center gap-2">Connecting... <Loader2 className="w-4 h-4 animate-spin" /></span>
                    ) : !browserSupported ? (
                        <span className="flex items-center justify-center gap-2">Browser Not Supported <AlertCircle className="w-5 h-5" /></span>
                    ) : allReady ? (
                        <span className="flex items-center justify-center gap-2">I'm Ready — Start Interview <CheckCircle2 className="w-5 h-5" /></span>
                    ) : (
                        <span className="flex items-center justify-center gap-2">Waiting for permissions <Loader2 className="w-4 h-4 animate-spin" /></span>
                    )}
                </Button>

                {/* Browser Compatibility Blocker */}
                {!browserSupported && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="fixed inset-0 z-[200] bg-white/90 backdrop-blur-xl flex items-center justify-center p-6 text-center"
                    >
                        <div className="max-w-md space-y-6">
                            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto border border-red-100">
                                <Monitor className="w-10 h-10 text-red-500" />
                            </div>
                            <div className="space-y-3">
                                <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Unsupported Platform</h2>
                                <p className="text-red-600 font-bold text-sm uppercase tracking-widest">{browserName}</p>
                                <p className="text-gray-500 text-sm leading-relaxed">
                                    For security and stability, this interview requires features only available in desktop browsers.
                                </p>
                                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 mt-4">
                                    <p className="text-[#F97316] font-black text-sm uppercase tracking-tight">Recommendation</p>
                                    <p className="text-[#F97316] text-[13px] font-bold mt-1">
                                        Please open this link in Google Chrome or Microsoft Edge on a laptop or desktop computer.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </motion.div>
            </div>
        </div>
    );
}
