"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Mic, CheckCircle2, AlertCircle, Loader2, Sparkles, RefreshCw, Volume2 } from "lucide-react";
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
    const [activeStep, setActiveStep] = useState(0);
    const [frequencies, setFrequencies] = useState<number[]>(new Array(40).fill(0));
    const [error, setError] = useState<string | null>(null);
    const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
    const [snapshotUploading, setSnapshotUploading] = useState(false);

    const allReady = cameraStatus === "granted" && micStatus === "granted" && micVerified;

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
        if (!SR) return;

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
                uploadSnapshot("verification");
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

    const requestPermissions = useCallback(async () => {
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
        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
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

                        <p className="text-center text-xs text-gray-400 font-medium">
                            Ensure your face is clearly visible and well-lit
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
                                    {micVerified ? "Voice Verified" : "Microphone Test"}
                                </span>
                                <h3 className="text-xl font-black text-gray-900">
                                    Please say the phrase below:
                                </h3>
                            </div>

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

                            <div className="flex justify-center items-center gap-2">
                                <Volume2 className={cn("w-4 h-4", micVerified ? "text-green-500" : "text-orange-400 animate-pulse")} />
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                    {micVerified ? "Voice Sync Complete" : "Waiting for audio..."}
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
                            {micVerified && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                        </div>
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
                            <button onClick={requestPermissions} className="text-red-400 hover:text-red-600 transition-colors shrink-0">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* CTA Button */}
                <Button
                    onClick={onComplete}
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
