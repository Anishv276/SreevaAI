"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Mic, CheckCircle2, AlertCircle, Loader2, Sparkles, RefreshCw, Volume2, Settings2, Activity, ChevronDown, Monitor, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const VERIFICATION_STEPS = [
    "I am ready to start the interview"
];

interface HardwareCheckProps {
    onComplete: () => void;
    isStarting?: boolean;
    errorMessage?: string | null;
    candidateName?: string;
    applicationId?: string;
}

type CheckStatus = "idle" | "requesting" | "granted" | "denied";

export function HardwareCheck({
    onComplete,
    isStarting = false,
    errorMessage = null,
    candidateName = "candidate",
    applicationId = "unknown",
}: HardwareCheckProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const animRef = useRef<number | null>(null);
    const recogRef = useRef<any>(null);
    const verifiedRef = useRef(false);
    const snapshotDoneRef = useRef(false);
    const currentStepRef = useRef(0);

    const [cameraStatus, setCameraStatus] = useState<CheckStatus>("idle");
    const [micStatus, setMicStatus] = useState<CheckStatus>("idle");
    const [micVerified, setMicVerified] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);
    const [activeStep, setActiveStep] = useState(0);
    const [frequencies, setFrequencies] = useState<number[]>(new Array(40).fill(0));
    const [error, setError] = useState<string | null>(null);
    const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
    const [snapshotUploading, setSnapshotUploading] = useState(false);
    
    // Device Selection
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [selectedMicId, setSelectedMicId] = useState('');
    const [isCamDropdownOpen, setIsCamDropdownOpen] = useState(false);
    const [isMicDropdownOpen, setIsMicDropdownOpen] = useState(false);
    
    // Network Speed
    const [uploadSpeedMbps, setUploadSpeedMbps] = useState<number | null>(null);
    const [speedTestRunning, setSpeedTestRunning] = useState(false);

    // Face Detection State
    const [faceWarning, setFaceWarning] = useState<string | null>(null);
    const faceDetectorRef = useRef<any>(null);
    const faceDetectionAnimRef = useRef<number | null>(null);
    const lastVideoTimeRef = useRef(-1);

    const allReady = cameraStatus === "granted" && micStatus === "granted" && micVerified && !faceWarning && (uploadSpeedMbps !== null && uploadSpeedMbps >= 1);


    // ── Suppress noisy TF Lite / MediaPipe internal logs ─────────────────────
    // The "INFO: Created TensorFlow Lite XNNPACK delegate for CPU" message comes
    // from inside the WASM binary and is surfaced by Next.js/Turbopack as a
    // visible error overlay. We patch console.info to silently drop it.
    useEffect(() => {
        const originalInfo = console.info.bind(console);
        const originalLog  = console.log.bind(console);
        const isNoise = (msg: unknown) =>
            typeof msg === "string" && (
                msg.includes("XNNPACK") ||
                msg.includes("TensorFlow Lite") ||
                msg.includes("Created TensorFlow")
            );

        console.info = (...args: unknown[]) => { if (!isNoise(args[0])) originalInfo(...args); };
        console.log  = (...args: unknown[]) => { if (!isNoise(args[0])) originalLog(...args); };

        return () => {
            console.info = originalInfo;
            console.log  = originalLog;
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
                }
            } catch (err) {
                console.error("Face landmarker initialization failed:", err);
            }
        };
        loadModel();
        return () => { mounted = false; };
    }, []);


    const startFaceDetection = useCallback(() => {
        const detect = () => {
            const video = videoRef.current;
            if (video && video.readyState >= 2 && faceDetectorRef.current && !video.paused && !video.ended) {
                if (video.currentTime !== lastVideoTimeRef.current) {
                    lastVideoTimeRef.current = video.currentTime;
                    try {
                        const result = faceDetectorRef.current.detectForVideo(video, performance.now());
                        if (!result || !result.faceLandmarks) return;

                        const numFaces = result.faceLandmarks.length;
                        
                        if (numFaces === 0) {
                            setFaceWarning("Please position your face in frame");
                        } else if (numFaces > 1) {
                            setFaceWarning("Only one person allowed in frame");
                        } else {
                            // Single face detected: Quality checks based on 478 landmarks
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
                            const cx = (minX + maxX) / 2;
                            const cy = (minY + maxY) / 2;

                            // (c) Center Check
                            if (cx < 0.35 || cx > 0.65 || cy < 0.25 || cy > 0.75) {
                                setFaceWarning("Please center your face on the screen");
                            } 
                            // (a) Size/Ratio Check
                            else if (faceWidth < 0.12) {
                                setFaceWarning("Please move closer to the camera");
                            } else if (faceWidth > 0.65) {
                                setFaceWarning("Please move slightly back");
                            } else {
                                // (b) Lighting Check via Canvas pixel sampling
                                const canvas = document.createElement('canvas');
                                canvas.width = 30; canvas.height = 30;
                                const ctx = canvas.getContext('2d');
                                if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
                                    const sx = Math.max(0, minX * video.videoWidth);
                                    const sy = Math.max(0, minY * video.videoHeight);
                                    const sw = faceWidth * video.videoWidth;
                                    const sh = faceHeight * video.videoHeight;
                                    
                                    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 30, 30);
                                    const imgData = ctx.getImageData(0, 0, 30, 30);
                                    let totalBrightness = 0;
                                    for (let i = 0; i < imgData.data.length; i += 4) {
                                        totalBrightness += (imgData.data[i] * 0.299 + imgData.data[i+1] * 0.587 + imgData.data[i+2] * 0.114);
                                    }
                                    const avgBrightness = totalBrightness / 900; // 30x30 = 900 pixels
                                    
                                    if (avgBrightness < 45) {
                                         setFaceWarning("Environment is too dark. Increase lighting.");
                                    } else if (avgBrightness > 240) {
                                         setFaceWarning("Environment is too bright (reduce backlight).");
                                    } else {
                                         setFaceWarning(null); // Perfect
                                    }
                                } else {
                                    setFaceWarning(null);
                                }
                            }
                        }
                    } catch (e) {
                         // ignore transient errors
                    }
                }
            }
            faceDetectionAnimRef.current = requestAnimationFrame(detect);
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
            if (resBody.url) {
                snapshotDoneRef.current = true;
                console.log("[HardwareCheck] Snapshot persisted successfully.");
            } else {
                console.error("[HardwareCheck] Snapshot upload failed - no URL in response:", resBody);
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
            const targetPhrase = VERIFICATION_STEPS[currentStepRef.current].toLowerCase();
            
            // One-step phrase matching
            if (transcript.includes(targetPhrase.split(" ").pop() || "") || transcript.length > 5) {
                verifiedRef.current = true;
                setMicVerified(true);
                setActiveStep(1);
                try { r.stop(); } catch {}
            }
        };

        r.onend = () => {
            if (!verifiedRef.current && recogRef.current === r) {
                setTimeout(() => { if (!verifiedRef.current) try { r.start(); } catch {} }, 250);
            }
        };

        try { r.start(); } catch {}

        return () => {
            if (recogRef.current === r) {
                try { r.abort(); } catch {}
                recogRef.current = null;
            }
        };
    }, [micStatus, uploadSnapshot]);

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

    const testNetworkSpeed = useCallback(async () => {
        setSpeedTestRunning(true);
        try {
            const payload = new Blob([new ArrayBuffer(1024 * 1024)]); // 1MB payload
            const start = performance.now();
            await fetch("/api/speedtest", { method: "POST", body: payload });
            const end = performance.now();
            const durationSec = (end - start) / 1000;
            const mbps = 8 / durationSec; // 1MB = 8 Megabits
            setUploadSpeedMbps(Number(mbps.toFixed(2)));
        } catch (e) {
            setUploadSpeedMbps(0);
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
        
        try {
            const constraints: MediaStreamConstraints = {
                video: cameraId ? { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
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
                await videoRef.current.play().catch(() => {});
            }
            setCameraStatus("granted");
            startFaceDetection();

            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (ctx.state === "suspended") await ctx.resume().catch(() => {});
            const analyzer = ctx.createAnalyser();
            analyzer.fftSize = 512;
            ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyzer);
            audioCtxRef.current = ctx;
            analyzerRef.current = analyzer;
            setMicStatus("granted");
            startVisualizer();
        } catch (err: any) {
            setCameraStatus("denied");
            setMicStatus("denied");
            setError("Could not access camera or microphone. Please check browser permissions.");
        }
    }, [startVisualizer]);

    useEffect(() => {
        requestPermissions();
        testNetworkSpeed();
        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
            if (faceDetectionAnimRef.current) cancelAnimationFrame(faceDetectionAnimRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
            audioCtxRef.current?.close();
            if (recogRef.current) try { recogRef.current.abort(); } catch {}
        };
    }, [requestPermissions]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white p-4">
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="w-full max-w-4xl space-y-6"
            >
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="inline-flex p-3 bg-orange-50 rounded-2xl mb-1 border border-orange-100">
                        <Sparkles className="w-7 h-7 text-[#F97316]" />
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Environment Check</h1>
                    <p className="text-gray-500 font-medium">Verify your camera and microphone before the interview begins</p>
                </div>

                <div className="grid md:grid-cols-2 gap-5">

                    {/* ── Left: Camera ── */}
                    <div className="space-y-3">
                        <div className="relative aspect-[4/3] bg-gray-100 rounded-3xl overflow-hidden border border-gray-200 shadow-xl">
                            <video
                                ref={videoRef}
                                autoPlay muted playsInline
                                className={cn(
                                    "w-full h-full object-cover scale-x-[-1] transition-opacity duration-500",
                                    cameraStatus === "granted" ? "opacity-100" : "opacity-0"
                                )}
                            />

                            {cameraStatus !== "granted" && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-50">
                                    <div className="p-5 bg-white rounded-2xl border border-gray-100">
                                        <Camera className={cn("w-10 h-10", cameraStatus === "requesting" ? "text-gray-300 animate-pulse" : "text-red-400")} />
                                    </div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                        {cameraStatus === "requesting" ? "Requesting access..." : "Camera required"}
                                    </p>
                                </div>
                            )}

                            {/* FACE DETECTION WARNING */}
                            <AnimatePresence>
                                {cameraStatus === "granted" && faceWarning && (
                                    <motion.div 
                                        initial={{ opacity: 0 }} 
                                        animate={{ opacity: 1 }} 
                                        exit={{ opacity: 0 }}
                                        className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 backdrop-blur-sm z-10"
                                    >
                                        <div className="p-3 bg-red-500 rounded-full animate-bounce shadow-[0_0_20px_rgba(239,68,68,0.5)]">
                                            <AlertCircle className="w-6 h-6 text-white" />
                                        </div>
                                        <p className="text-white font-black uppercase tracking-widest text-xs px-4 text-center">
                                            {faceWarning}
                                        </p>
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

                        <p className={cn("text-center text-xs font-medium", faceWarning ? "text-red-500 animate-pulse font-bold" : "text-gray-400")}>
                            {faceWarning ? faceWarning : "Ensure your face is clearly visible and well-lit"}
                        </p>

                        {/* Camera status badge */}
                        <div className={cn(
                            "flex items-center gap-3 p-4 rounded-2xl border transition-all",
                            cameraStatus === "granted" ? "bg-green-50 border-green-100" :
                            cameraStatus === "denied" ? "bg-red-50 border-red-100" :
                            "bg-white border-gray-100 shadow-sm"
                        )}>
                            <div className={cn("p-2 rounded-xl", cameraStatus === "granted" ? "bg-green-500 text-white" : cameraStatus === "denied" ? "bg-red-500 text-white" : "bg-gray-100 text-gray-400")}>
                                <Camera className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Camera</p>
                                <p className={cn("text-xs font-bold", cameraStatus === "granted" ? "text-green-700" : cameraStatus === "denied" ? "text-red-700" : "text-gray-400")}>
                                    {cameraStatus === "granted" ? "✓ Ready" : cameraStatus === "denied" ? "Access Denied" : "Requesting..."}
                                </p>
                            </div>
                            
                            {/* PREMIUM CAMERA SELECTOR */}
                            {devices.length > 0 && cameraStatus === "granted" && (
                                <div className="relative">
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
                                                        <span className="text-xs font-bold truncate">{d.label || `Camera ${d.deviceId.slice(0,5)}`}</span>
                                                        {selectedCameraId === d.deviceId && <CheckCircle2 className="w-3 h-3 ml-auto" />}
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                            
                            {cameraStatus === "granted" && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                        </div>
                    </div>

                    {/* ── Right: Mic Verification ── */}
                    <div className="flex flex-col gap-4">
                        <div className={cn(
                            "flex-1 rounded-3xl border p-6 flex flex-col gap-6 transition-all duration-500",
                            micVerified ? "bg-green-50 border-green-100" : "bg-white border-gray-100 shadow-sm"
                        )}>
                            <div className="space-y-4 text-center py-4">
                                <span className={cn(
                                    "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em]",
                                    micVerified ? "bg-green-100 text-green-700" : "bg-orange-100 text-[#F97316]"
                                )}>
                                    {micVerified ? "Voice Verified" : (speechSupported ? "Microphone Test" : "Manual Verification")}
                                </span>
                                <h3 className="text-xl font-black text-gray-900">
                                    {speechSupported ? "Please say the phrase below:" : "Voice recognition not supported in this browser."}
                                </h3>
                            </div>

                            {speechSupported ? (
                                <motion.div
                                    animate={{ borderColor: micVerified ? "#22c55e" : "#F97316" }}
                                    className={cn(
                                        "flex-1 p-8 rounded-[2rem] border-4 transition-all flex items-center justify-center text-center",
                                        micVerified ? "bg-white border-green-500" : "bg-orange-50/30 border-orange-500/20 shadow-inner"
                                    )}
                                >
                                    <p className={cn("text-xl font-black leading-tight", micVerified ? "text-green-700" : "text-gray-900")}>
                                        "{VERIFICATION_STEPS[0]}"
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

                        {/* Mic status badge */}
                        <div className={cn(
                            "flex items-center gap-3 p-4 rounded-2xl border transition-all",
                            micVerified ? "bg-green-50 border-green-100" :
                            micStatus === "granted" ? "bg-amber-50 border-amber-100" :
                            micStatus === "denied" ? "bg-red-50 border-red-100" :
                            "bg-white border-gray-100 shadow-sm"
                        )}>
                            <div className={cn("p-2 rounded-xl",
                                micVerified ? "bg-green-500 text-white" :
                                micStatus === "granted" ? "bg-amber-500 text-white" :
                                micStatus === "denied" ? "bg-red-500 text-white" :
                                "bg-gray-100 text-gray-400"
                            )}>
                                <Mic className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Microphone</p>
                                <p className={cn("text-xs font-bold",
                                    micVerified ? "text-green-700" :
                                    micStatus === "granted" ? "text-amber-700" :
                                    micStatus === "denied" ? "text-red-700" :
                                    "text-gray-400"
                                )}>
                                    {micVerified ? "✓ Ready" : micStatus === "granted" ? "Speak to verify..." : micStatus === "denied" ? "Access Denied" : "Requesting..."}
                                </p>
                            </div>

                            {/* PREMIUM MIC SELECTOR */}
                            {devices.length > 0 && micStatus === "granted" && (
                                <div className="relative">
                                    <button 
                                        onClick={() => setIsMicDropdownOpen(!isMicDropdownOpen)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-100 hover:border-orange-200 transition-all rounded-xl shadow-sm group"
                                    >
                                        <AudioLines className="w-3.5 h-3.5 text-gray-400 group-hover:text-orange-500" />
                                        <span className="text-[11px] font-bold text-gray-600 max-w-[80px] truncate">
                                            {devices.find(d => d.deviceId === selectedMicId)?.label || "Microphone"}
                                        </span>
                                        <ChevronDown className={cn("w-3 h-3 text-gray-400 transition-transform", isMicDropdownOpen && "rotate-180")} />
                                    </button>
                                    
                                    <AnimatePresence>
                                        {isMicDropdownOpen && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                                className="absolute bottom-full mb-2 right-0 w-64 bg-white border border-gray-100 rounded-2xl shadow-2xl p-2 z-50 ring-4 ring-black/5"
                                            >
                                                <div className="px-3 py-2 border-b border-gray-50 mb-1">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Available Microphones</p>
                                                </div>
                                                {devices.filter(d => d.kind === "audioinput").map(d => (
                                                    <button
                                                        key={d.deviceId}
                                                        onClick={() => {
                                                            setSelectedMicId(d.deviceId);
                                                            requestPermissions(selectedCameraId, d.deviceId);
                                                            setIsMicDropdownOpen(false);
                                                        }}
                                                        className={cn(
                                                            "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all",
                                                            selectedMicId === d.deviceId ? "bg-orange-50 text-[#F97316]" : "hover:bg-gray-50 text-gray-600"
                                                        )}
                                                    >
                                                        <div className={cn("p-1.5 rounded-lg", selectedMicId === d.deviceId ? "bg-orange-100" : "bg-gray-100")}>
                                                            <Mic className="w-3.5 h-3.5" />
                                                        </div>
                                                        <span className="text-xs font-bold truncate">{d.label || `Mic ${d.deviceId.slice(0,5)}`}</span>
                                                        {selectedMicId === d.deviceId && <CheckCircle2 className="w-3 h-3 ml-auto" />}
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
                </div>

                {/* Network & Device Summary Container */}
                <div className="flex flex-col gap-4 max-w-4xl w-full mx-auto">
                    {/* Network Speed UI */}
                    <div className={cn(
                        "flex items-center gap-4 p-5 rounded-3xl border transition-all duration-500",
                        speedTestRunning ? "bg-white border-gray-100 animate-pulse" :
                        uploadSpeedMbps !== null && uploadSpeedMbps >= 1 
                            ? "bg-green-50/50 border-green-100 shadow-[0_8px_16px_rgba(34,197,94,0.05)]" 
                            : "bg-red-50/50 border-red-100 shadow-[0_8px_16px_rgba(239,68,68,0.05)]"
                    )}>
                        <div className={cn(
                            "p-3 rounded-2xl shadow-sm transition-all duration-500", 
                            speedTestRunning ? "bg-gray-100 text-gray-300" : 
                            uploadSpeedMbps !== null && uploadSpeedMbps >= 1 ? "bg-green-500 text-white" : "bg-red-500 text-white"
                        )}>
                            {speedTestRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5" />}
                        </div>

                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400">Connection Quality</p>
                                {uploadSpeedMbps !== null && !speedTestRunning && (
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                                        uploadSpeedMbps >= 5 ? "bg-green-100 text-green-700" : 
                                        uploadSpeedMbps >= 1 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                                    )}>
                                        {uploadSpeedMbps >= 5 ? "Excellent" : uploadSpeedMbps >= 1 ? "Good" : "Unstable"}
                                    </span>
                                )}
                            </div>
                            <h4 className={cn("text-lg font-black tracking-tight", speedTestRunning ? "text-gray-400" : uploadSpeedMbps !== null && uploadSpeedMbps >= 1 ? "text-gray-900" : "text-red-700")}>
                                {speedTestRunning ? "Analyzing network..." : uploadSpeedMbps !== null ? `${uploadSpeedMbps} Mbps Upload` : "Test Failed"}
                            </h4>
                        </div>

                        {!speedTestRunning && uploadSpeedMbps !== null && (
                            <div className="flex items-center gap-3">
                                {uploadSpeedMbps < 1 && (
                                    <div className="hidden sm:flex flex-col items-end">
                                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Action Required</p>
                                        <p className="text-[9px] font-medium text-red-400">Find a stronger signal</p>
                                    </div>
                                )}
                                <button 
                                    onClick={testNetworkSpeed}
                                    className="p-3 rounded-xl bg-white border border-gray-100 text-gray-400 hover:text-orange-500 hover:border-orange-100 hover:shadow-lg transition-all active:scale-95"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                                {uploadSpeedMbps >= 1 && (
                                    <div className="h-10 w-10 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-green-500/20">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                )}
                            </div>
                        )}
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
                </div>

                {/* CTA Button */}
                <Button
                    onClick={async () => {
                        await uploadSnapshot("interview_start");
                        onComplete();
                    }}
                    disabled={!allReady || isStarting}
                    className={cn(
                        "w-full h-14 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300",
                        allReady
                            ? "bg-[#F97316] hover:bg-orange-600 text-white shadow-[0_10px_30px_rgba(249,115,22,0.3)] active:scale-95"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}
                >
                    {isStarting ? (
                        <span className="flex items-center justify-center gap-2">Connecting... <Loader2 className="w-4 h-4 animate-spin" /></span>
                    ) : allReady ? (
                        <span className="flex items-center justify-center gap-2">I'm Ready — Start Interview <CheckCircle2 className="w-5 h-5" /></span>
                    ) : (
                        <span className="flex items-center justify-center gap-2">Waiting for permissions <Loader2 className="w-4 h-4 animate-spin" /></span>
                    )}
                </Button>
            </motion.div>
        </div>
    );
}
