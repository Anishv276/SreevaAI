"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Mic, CheckCircle2, AlertCircle, Loader2, Sparkles, Video, Mic2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface HardwareCheckProps {
    onComplete: () => void;
    isStarting?: boolean;
    errorMessage?: string | null;
}

export function HardwareCheck({ onComplete, isStarting = false, errorMessage = null }: HardwareCheckProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationRef = useRef<number | null>(null);
    
    const [status, setStatus] = useState({
        camera: "idle" as "idle" | "requesting" | "granted" | "denied",
        mic: "idle" as "idle" | "requesting" | "granted" | "denied",
    });
    const [frequencies, setFrequencies] = useState<number[]>(new Array(24).fill(0));
    const [volume, setVolume] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const ensureAudioContextRunning = async () => {
        const ctx = audioContextRef.current;
        if (!ctx || ctx.state === "running") return;

        try {
            await ctx.resume();
        } catch {
            // Browser can reject resume until a user gesture is received.
        }
    };

    const attachVideoStream = async (stream: MediaStream) => {
        if (!videoRef.current) return;

        if (videoRef.current.srcObject !== stream) {
            videoRef.current.srcObject = stream;
        }

        try {
            await videoRef.current.play();
        } catch (e) {
            console.warn("Auto-play failed:", e);
        }
    };

    const checkPermissions = async () => {
        setStatus({ camera: "requesting", mic: "requesting" });
        setError(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
                audio: true,
            });

            streamRef.current = stream;
            
            await attachVideoStream(stream);

            // Audio Setup for Visualizer
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioTrack = stream.getAudioTracks()[0];
            const audioStream = new MediaStream(audioTrack ? [audioTrack] : []);
            const analyzer = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(audioStream);
            source.connect(analyzer);
            analyzer.fftSize = 256; // Smaller FFT for snappier high/low response
            analyzer.minDecibels = -85;
            analyzer.maxDecibels = -10;
            analyzer.smoothingTimeConstant = 0.7;

            if (audioContext.state === "suspended") {
                await audioContext.resume().catch(() => undefined);
            }
            
            audioContextRef.current = audioContext;
            analyzerRef.current = analyzer;

            setStatus({ camera: "granted", mic: "granted" });
            updateAudioData();
        } catch (err: any) {
            console.error("Permission error:", err);
            
            // Comprehensive Error Handling
            const isDenied = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
            const isBusy = err.name === "NotReadableError" || err.name === "TrackStartError";
            const isNotFound = err.name === "NotFoundError" || err.name === "DevicesNotFoundError";

            setStatus({
                camera: (isDenied || isBusy || isNotFound) ? "denied" : "denied",
                mic: (isDenied || isBusy || isNotFound) ? "denied" : "denied",
            });

            if (isBusy) {
                setError("Your camera or microphone is being used by another application (like Zoom or Teams). Please close them and try again.");
            } else if (isDenied) {
                setError("Permission denied. Please click the camera icon in your browser address bar to allow access.");
            } else if (isNotFound) {
                setError("No camera or microphone detected. Please plug in your devices and refresh the page.");
            } else {
                setError("Could not access hardware. Please check your browser settings and try again.");
            }
        }
    };

    const updateAudioData = () => {
        if (!analyzerRef.current) return;

        if (audioContextRef.current?.state === "suspended") {
            ensureAudioContextRunning();
        }

        const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
        analyzerRef.current.getByteFrequencyData(dataArray);

        // We want 12 bins for half of our 24 bars (symmetrical butterfly effect)
        const newFrequencies = new Array(24).fill(0);
        const binSize = Math.floor(dataArray.length / 12);
        
        for (let i = 0; i < 12; i++) {
            let sum = 0;
            for (let j = 0; j < binSize; j++) {
                sum += dataArray[i * binSize + j];
            }
            const avg = sum / binSize;
            const normalized = avg / 255;
            
            // Mirror from center (Bass/low frequencies at center, Treble/high at edges)
            // Center is 11 and 12
            newFrequencies[11 - i] = normalized;
            newFrequencies[12 + i] = normalized;
        }

        setFrequencies(newFrequencies);
        animationRef.current = requestAnimationFrame(updateAudioData);
    };

    useEffect(() => {
        checkPermissions();
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            streamRef.current?.getTracks().forEach(track => track.stop());
            audioContextRef.current?.close();
        };
    }, []);

    useEffect(() => {
        const unlockAudio = () => {
            ensureAudioContextRunning();
        };

        window.addEventListener("pointerdown", unlockAudio);
        window.addEventListener("keydown", unlockAudio);

        return () => {
            window.removeEventListener("pointerdown", unlockAudio);
            window.removeEventListener("keydown", unlockAudio);
        };
    }, []);

    useEffect(() => {
        if (status.camera === "granted" && streamRef.current) {
            attachVideoStream(streamRef.current);
        }
    }, [status.camera]);

    const allGranted = status.camera === "granted" && status.mic === "granted";

    return (
        <div className="flex flex-col items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-gray-100 overflow-hidden"
            >

                {/* Header */}
                <div className="p-8 pb-0 text-center">
                    <div className="inline-flex p-3 bg-orange-50 rounded-2xl mb-4">
                        <Sparkles className="w-6 h-6 text-[#F97316]" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Setup Interview</h2>
                    <p className="text-gray-500 font-medium mt-1">Check your hardware before we begin</p>
                </div>

                {/* Video Preview Area */}
                <div className="p-8">
                    <div className="relative aspect-square bg-gray-900 rounded-3xl overflow-hidden border-4 border-gray-50 shadow-inner group">

                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            onLoadedMetadata={() => {
                                if (videoRef.current) {
                                    videoRef.current.play().catch(() => undefined);
                                }
                            }}
                            className={cn(
                                "w-full h-full object-cover mirror transition-opacity duration-300",
                                status.camera === "granted" ? "opacity-100" : "opacity-0"
                            )}
                        />

                        {status.camera !== "granted" && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                                <div className="p-4 bg-gray-800 rounded-full animate-pulse">
                                    <Video className="w-8 h-8 text-gray-600" />
                                </div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                    {status.camera === "requesting" ? "Initializing Camera..." : "Camera Access Required"}
                                </p>
                            </div>
                        )}

                    {/* Audio Visualizer Overlay */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center justify-center gap-[3px] h-12 px-6 py-3 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl">
                            <Mic2 className="w-3.5 h-3.5 text-white mr-2 opacity-80 animate-pulse" />
                            {frequencies.map((freq, i) => {
                                // Create a symmetrical waveform effect: heights are based on real frequency data
                                // freq is already normalized 0-1
                                
                                return (
                                    <motion.div
                                        key={i}
                                        animate={{ 
                                            height: `${Math.max(6, (freq * 100))}%`
                                        }}
                                        transition={{ 
                                            type: "spring", 
                                            stiffness: 400, 
                                            damping: 20,
                                            mass: 0.8
                                        }}
                                        className="w-1 bg-gradient-to-t from-[#F97316] to-orange-300 rounded-full"
                                    />
                                );
                            })}
                        </div>
                    </div>

                    {/* Status Indicators */}
                    <div className="mt-8 grid grid-cols-2 gap-4">
                        <div className={cn(
                            "p-4 rounded-2xl border transition-all duration-300 flex items-center gap-3",
                            status.camera === "granted" ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-100"
                        )}>
                            <div className={cn(
                                "p-2 rounded-xl",
                                status.camera === "granted" ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"
                            )}>
                                <Camera className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Camera</p>
                                <p className={cn(
                                    "text-xs font-bold",
                                    status.camera === "granted" ? "text-green-700" : "text-gray-500"
                                )}>
                                    {status.camera === "granted" ? "Connected" : "Not Found"}
                                </p>
                            </div>
                        </div>

                        <div className={cn(
                            "p-4 rounded-2xl border transition-all duration-300 flex items-center gap-3",
                            status.mic === "granted" ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-100"
                        )}>
                            <div className={cn(
                                "p-2 rounded-xl",
                                status.mic === "granted" ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"
                            )}>
                                <Mic className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Microphone</p>
                                <p className={cn(
                                    "text-xs font-bold",
                                    status.mic === "granted" ? "text-green-700" : "text-gray-500"
                                )}>
                                    {status.mic === "granted" ? "Connected" : "Not Found"}
                                </p>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3"
                        >
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-red-700 font-medium leading-relaxed">{error}</p>
                        </motion.div>
                    )}

                    {errorMessage && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3"
                        >
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-red-700 font-medium leading-relaxed">{errorMessage}</p>
                        </motion.div>
                    )}
                </div>

                {/* Footer Action */}
                <div className="p-8 pt-0">
                    <Button
                        onClick={onComplete}
                        disabled={!allGranted || isStarting}
                        className={cn(
                            "w-full h-14 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300",
                            allGranted 
                                ? "bg-[#F97316] hover:bg-orange-600 text-white shadow-[0_10px_30px_rgba(249,115,22,0.3)] active:scale-95" 
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        )}
                    >
                        {isStarting ? (
                            <span className="flex items-center gap-2">
                                Connecting to server <Loader2 className="w-4 h-4 animate-spin" />
                            </span>
                        ) : allGranted ? (
                            <span className="flex items-center gap-2">
                                Everything is working <CheckCircle2 className="w-5 h-5" />
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                Waiting for access <Loader2 className="w-4 h-4 animate-spin" />
                            </span>
                        )}
                    </Button>
                </div>
            </motion.div>
            
            <style jsx>{`
                .mirror {
                    transform: scaleX(-1);
                }
            `}</style>
        </div>
    );
}
