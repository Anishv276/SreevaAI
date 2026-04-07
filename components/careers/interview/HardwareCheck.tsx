"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Mic, CheckCircle2, AlertCircle, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const animRef = useRef<number | null>(null);
    const snapshotDoneRef = useRef(false);
    const micVerifiedRef = useRef(false);
    const speechFramesRef = useRef(0); // consecutive frames above threshold

    const [cameraStatus, setCameraStatus] = useState<CheckStatus>("idle");
    const [micStatus, setMicStatus] = useState<CheckStatus>("idle");
    const [micVerified, setMicVerified] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
    const [snapshotUploading, setSnapshotUploading] = useState(false);

    const allReady = cameraStatus === "granted" && micStatus === "granted" && micVerified;

    // ── Snapshot ─────────────────────────────────────────────────────────────
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
            if ((await r.json()).url) snapshotDoneRef.current = true;
        } catch { /* silent */ } finally {
            setSnapshotUploading(false);
        }
    }, [candidateName, applicationId]);

    // ── Waveform loop — triggered by useEffect AFTER canvas is in DOM ─────────
    // This effect fires every time micStatus becomes "granted", which means
    // React has already re-rendered and the <canvas> is mounted in the DOM.
    useEffect(() => {
        if (micStatus !== "granted") return;
        if (animRef.current) cancelAnimationFrame(animRef.current);

        const draw = () => {
            const canvas = canvasRef.current;
            const analyzer = analyzerRef.current;
            if (!canvas || !analyzer) {
                animRef.current = requestAnimationFrame(draw);
                return;
            }

            // Always sync canvas buffer size to its CSS size
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                if (canvas.width !== rect.width) canvas.width = rect.width;
                if (canvas.height !== rect.height) canvas.height = rect.height;
            }

            const ctx = canvas.getContext("2d");
            if (!ctx) { animRef.current = requestAnimationFrame(draw); return; }

            const bufferLength = analyzer.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyzer.getByteTimeDomainData(dataArray);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = micVerifiedRef.current ? "#22c55e" : "#F97316";
            ctx.beginPath();

            const sliceWidth = canvas.width / bufferLength;
            let x = 0;
            let maxAmp = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = (v * canvas.height) / 2;
                const amp = Math.abs(dataArray[i] - 128);
                if (amp > maxAmp) maxAmp = amp;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                x += sliceWidth;
            }

            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();

            // Require sustained speech: amplitude > 20 for 8+ consecutive frames
            // This filters out mic noise floor, fan hum, and random pops.
            if (!micVerifiedRef.current) {
                if (maxAmp > 20) {
                    speechFramesRef.current += 1;
                } else {
                    speechFramesRef.current = 0; // reset if sound drops off
                }

                if (speechFramesRef.current >= 8) {
                    micVerifiedRef.current = true;
                    setMicVerified(true);
                    uploadSnapshot("verification");
                }
            }

            animRef.current = requestAnimationFrame(draw);
        };

        // Small delay to ensure React has finished painting the canvas into the DOM
        const timer = setTimeout(() => {
            animRef.current = requestAnimationFrame(draw);
        }, 100);

        return () => {
            clearTimeout(timer);
            if (animRef.current) {
                cancelAnimationFrame(animRef.current);
                animRef.current = null;
            }
            speechFramesRef.current = 0;
        };
    }, [micStatus, uploadSnapshot]);

    // ── Request camera + mic ──────────────────────────────────────────────────
    const requestPermissions = useCallback(async () => {
        setError(null);
        setCameraStatus("requesting");
        setMicStatus("idle"); // reset to idle first to re-trigger the effect
        setMicVerified(false);
        micVerifiedRef.current = false;
        speechFramesRef.current = 0;
        snapshotDoneRef.current = false;
        setSnapshotUrl(null);

        // Stop old animation frame if any
        if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
                audio: true,
            });
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => {});
            }
            setCameraStatus("granted");

            // Build audio pipeline
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            const audioCtx = new AudioCtx();
            // Resume immediately — important for Chrome's autoplay policy
            if (audioCtx.state === "suspended") await audioCtx.resume();

            const analyzer = audioCtx.createAnalyser();
            analyzer.fftSize = 2048;
            analyzer.smoothingTimeConstant = 0.3;

            const source = audioCtx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
            source.connect(analyzer);

            audioContextRef.current = audioCtx;
            analyzerRef.current = analyzer;

            // Setting micStatus to "granted" triggers the useEffect above,
            // which starts the waveform loop AFTER the canvas is in the DOM.
            setMicStatus("granted");

        } catch (err: any) {
            setCameraStatus("denied");
            setMicStatus("denied");
            const msg =
                err.name === "NotAllowedError" ? "Permission denied. Allow camera & mic in your browser's address bar." :
                err.name === "NotReadableError" ? "Device busy. Close Zoom/Teams and retry." :
                err.name === "NotFoundError" ? "No camera/mic found. Plug them in and refresh." :
                "Could not access devices. Check browser settings.";
            setError(msg);
        }
    }, []);

    // Start on mount
    useEffect(() => {
        requestPermissions();
        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
            audioContextRef.current?.close();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Unlock AudioContext on any user interaction (Chrome autoplay policy)
    useEffect(() => {
        const unlock = () => {
            if (audioContextRef.current?.state === "suspended") {
                audioContextRef.current.resume();
            }
        };
        window.addEventListener("pointerdown", unlock);
        window.addEventListener("keydown", unlock);
        return () => {
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        };
    }, []);

    const StatusBadge = ({ label, ok, pending, denied }: { label: string; ok: boolean; pending?: boolean; denied?: boolean }) => (
        <div className={cn(
            "flex items-center gap-3 p-4 rounded-2xl border transition-all duration-300",
            ok ? "bg-green-50 border-green-200" : pending ? "bg-amber-50 border-amber-100" : denied ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"
        )}>
            <div className={cn("p-2 rounded-xl", ok ? "bg-green-500 text-white" : pending ? "bg-amber-400 text-white" : denied ? "bg-red-400 text-white" : "bg-gray-200 text-gray-400")}>
                {label === "Camera" ? <Camera className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </div>
            <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
                <p className={cn("text-xs font-bold", ok ? "text-green-700" : pending ? "text-amber-600" : denied ? "text-red-600" : "text-gray-400")}>
                    {ok ? "✓ Ready" : pending ? "Say anything to verify..." : denied ? "Access Denied" : "Requesting..."}
                </p>
            </div>
            {ok && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
        </div>
    );

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#FDFCFB] p-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className="w-full max-w-3xl space-y-6">

                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="inline-flex p-3 bg-orange-50 rounded-2xl mb-1">
                        <Sparkles className="w-7 h-7 text-[#F97316]" />
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Environment Check</h1>
                    <p className="text-gray-500 font-medium">Verify your camera and microphone before we begin</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {/* Camera panel */}
                    <div className="space-y-3">
                        <div className="relative aspect-[4/3] bg-gray-900 rounded-3xl overflow-hidden border border-gray-200 shadow-xl">
                            <video ref={videoRef} autoPlay muted playsInline
                                className={cn("w-full h-full object-cover scale-x-[-1] transition-opacity duration-500",
                                    cameraStatus === "granted" ? "opacity-100" : "opacity-0")} />

                            {cameraStatus !== "granted" && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                    <div className="p-4 bg-gray-800/80 rounded-2xl">
                                        <Camera className={cn("w-10 h-10", cameraStatus === "requesting" ? "text-gray-400 animate-pulse" : "text-red-400")} />
                                    </div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                        {cameraStatus === "requesting" ? "Initializing..." : "Camera Required"}
                                    </p>
                                </div>
                            )}
                            {cameraStatus === "granted" && (
                                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                    <span className="text-[9px] font-black text-white uppercase tracking-widest">Live</span>
                                </div>
                            )}
                            {/* Snapshot preview */}
                            <AnimatePresence>
                                {snapshotUrl && (
                                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                                        className="absolute bottom-3 right-3 w-14 h-14 rounded-xl overflow-hidden border-2 border-green-400 shadow-lg">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={snapshotUrl} alt="snap" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                            {snapshotUploading ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <CheckCircle2 className="w-3 h-3 text-green-400" />}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <p className="text-center text-xs text-gray-400 font-medium">Ensure your face is visible and well-lit</p>
                        <StatusBadge label="Camera" ok={cameraStatus === "granted"} denied={cameraStatus === "denied"} />
                    </div>

                    {/* Mic panel */}
                    <div className="flex flex-col gap-4">
                        <div className={cn("flex-1 rounded-3xl border p-6 flex flex-col gap-4 transition-all duration-500",
                            micVerified ? "bg-green-50 border-green-200" : "bg-white border-gray-100 shadow-sm")}>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Mic className={cn("w-4 h-4", micVerified ? "text-green-600" : "text-[#F97316]")} />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                        {micVerified ? "Mic Verified ✓" : "Microphone Check"}
                                    </p>
                                </div>
                                {!micVerified && micStatus === "granted" && (
                                    <span className="text-[9px] font-bold text-[#F97316] uppercase tracking-widest animate-pulse">● Listening</span>
                                )}
                            </div>

                            {/* Instruction + Waveform — always visible when granted */}
                            <div className="space-y-4">
                                {!micVerified && (
                                    <div>
                                        <p className="text-xl md:text-2xl font-black leading-snug tracking-tight text-gray-700">
                                            Say anything to verify your microphone
                                        </p>
                                        <p className="text-sm text-gray-400 font-medium mt-2">
                                            e.g. "Hello" or count to three
                                        </p>
                                    </div>
                                )}

                                {/* Waveform canvas — rendered as soon as mic is granted */}
                                {micStatus === "granted" && (
                                    <div className={cn(
                                        "h-24 w-full rounded-2xl border transition-all duration-500 overflow-hidden relative",
                                        micVerified ? "bg-green-100/50 border-green-200" : "bg-gray-900/5 border-gray-200"
                                    )}>
                                        <canvas ref={canvasRef} className="w-full h-full block" />
                                        {micVerified && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-green-50/30 backdrop-blur-[1px]">
                                                <div className="flex items-center gap-2 bg-white/90 px-4 py-2 rounded-full shadow-sm border border-green-200">
                                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                                    <span className="text-xs font-bold text-green-700 uppercase tracking-wider">Mic Verified</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {micVerified && (
                                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-2 text-green-700 py-1">
                                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                                    <p className="text-sm font-black">Microphone is working perfectly!</p>
                                </motion.div>
                            )}
                        </div>

                        <StatusBadge label="Microphone"
                            ok={micVerified}
                            pending={micStatus === "granted" && !micVerified}
                            denied={micStatus === "denied"} />
                    </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                    {(error || errorMessage) && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-[12px] text-red-700 font-medium leading-relaxed flex-1">{error || errorMessage}</p>
                            <button onClick={requestPermissions} className="text-red-400 hover:text-red-600 transition-colors shrink-0">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* CTA */}
                <Button onClick={onComplete} disabled={!allReady || isStarting}
                    className={cn("w-full h-14 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300",
                        allReady
                            ? "bg-[#F97316] hover:bg-orange-600 text-white shadow-[0_10px_30px_rgba(249,115,22,0.3)] active:scale-95"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed")}>
                    {isStarting ? (
                        <span className="flex items-center justify-center gap-2">Connecting... <Loader2 className="w-4 h-4 animate-spin" /></span>
                    ) : allReady ? (
                        <span className="flex items-center justify-center gap-2">I'm Ready — Start Interview <CheckCircle2 className="w-5 h-5" /></span>
                    ) : micStatus === "granted" && !micVerified ? (
                        <span className="flex items-center justify-center gap-2">Say something to verify mic <Mic className="w-4 h-4 animate-pulse" /></span>
                    ) : (
                        <span className="flex items-center justify-center gap-2">Waiting for permissions <Loader2 className="w-4 h-4 animate-spin" /></span>
                    )}
                </Button>
            </motion.div>
        </div>
    );
}
