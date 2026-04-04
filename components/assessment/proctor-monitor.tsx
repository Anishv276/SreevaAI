"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, AlertCircle, Mic, MicOff } from "lucide-react";

interface ProctorMonitorProps {
    onFlag: (type: string, reason: string, screenshot?: string) => void;
}

type MonitorStatus = {
    webcam: "active" | "denied" | "loading";
    audio: "active" | "denied" | "loading";
    face: "present" | "absent" | "multiple" | "loading";
};

export function ProctorMonitor({ onFlag }: ProctorMonitorProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animFrameRef = useRef<number>(0);
    const faceLandmarkerRef = useRef<any>(null);
    const lastFaceCheckRef = useRef<number>(Date.now());
    const consecutiveAbsenceRef = useRef<number>(0);
    const headTurnFramesRef = useRef<number>(0);
    const vadInstanceRef = useRef<any>(null);
    const initializingRef = useRef<boolean>(false);

    const [status, setStatus] = useState<MonitorStatus>({
        webcam: "loading",
        audio: "loading",
        face: "loading",
    });
    const [flagCount, setFlagCount] = useState(0);
    const flagCountRef = useRef(0);

    const addFlag = useCallback((type: string, reason: string, screenshot?: string) => {
        onFlag(type, reason, screenshot);
        flagCountRef.current += 1;
        setFlagCount(flagCountRef.current);
    }, [onFlag]);

    // ── 1. WEBCAM STREAM ─────────────────────────────────────────────
    useEffect(() => {
        async function startWebcam() {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
                    audio: true, // Required for Silero VAD detection
                });
                streamRef.current = mediaStream;
                const video = videoRef.current;
                if (video) {
                    video.srcObject = mediaStream;
                    video.width = 320;
                    video.height = 240;
                    // Explicitly play the video — needed on some browsers
                    video.onloadedmetadata = () => {
                        video.play().catch(() => {});
                    };
                }
                setStatus(s => ({ ...s, webcam: "active" }));
            } catch {
                setStatus(s => ({ ...s, webcam: "denied", face: "absent" }));
                addFlag("WebcamError", "Candidate denied webcam access.");
            }
        }
        startWebcam();

        return () => {
            streamRef.current?.getTracks().forEach(t => t.stop());
            cancelAnimationFrame(animFrameRef.current);
        };
    }, [addFlag]);

    // ── 2. SILERO VAD — AUDIO SPEECH DETECTION ───────────────────────
    useEffect(() => {
        let destroyed = false;

        async function startVAD() {
            if (vadInstanceRef.current) return;
            
            try {
                const { MicVAD } = await import("@ricky0123/vad-web");
                const vad = await MicVAD.new({
                    baseAssetPath: "/vad/",
                    onnxWASMBasePath: "/vad/",
                    onSpeechStart: () => {
                        if (!destroyed) {
                            addFlag("SpeechDetected", "Human speech detected in the assessment environment.");
                        }
                    },
                });
                
                if (!destroyed) {
                    vadInstanceRef.current = vad;
                    await vad.start();
                    setStatus(s => ({ ...s, audio: "active" }));
                } else {
                    vad.destroy();
                }
            } catch (err) {
                console.warn("VAD failed to load:", err);
                setStatus(s => ({ ...s, audio: "denied" }));
            }
        }

        startVAD();

        return () => {
            destroyed = true;
            if (vadInstanceRef.current) {
                vadInstanceRef.current.destroy();
                vadInstanceRef.current = null;
            }
        };
    }, [addFlag]);

    // ── 3. MEDIAPIPE FACE LANDMARKER — reduced from every frame to every 1s ─
    useEffect(() => {
        let running = true;
        let rafId: number;

        async function initFaceLandmarker() {
            try {
                const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");

                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
                );

                faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                        delegate: "GPU",
                    },
                    runningMode: "VIDEO",
                    numFaces: 3,
                    outputFacialTransformationMatrixes: true,
                });

                setStatus(s => ({ ...s, face: "present" }));
                runDetectionLoop();
            } catch (err) {
                console.error("MediaPipe init failed:", err);
            }
        }

        function runDetectionLoop() {
            if (!running || !faceLandmarkerRef.current || !videoRef.current) return;

            const now = Date.now();
            // Increased interval to 1000ms (was 500ms) to reduce CPU load
            if (now - lastFaceCheckRef.current > 1000) {
                lastFaceCheckRef.current = now;

                const video = videoRef.current;
                // Only run if video has actual data
                if (video && video.readyState >= 2 && video.videoWidth > 0) {
                    try {
                        const results = faceLandmarkerRef.current.detectForVideo(video, now);
                        const count = results?.faceLandmarks?.length ?? 0;

                        if (count === 0) {
                            consecutiveAbsenceRef.current += 1;
                            setStatus(s => ({ ...s, face: "absent" }));
                            if (consecutiveAbsenceRef.current === 3) {
                                const snapshot = captureSnapshot();
                                addFlag("FaceAbsent", "Candidate's face not visible in webcam frame.", snapshot);
                            }
                        } else {
                            consecutiveAbsenceRef.current = 0;

                            if (count > 1) {
                                setStatus(s => ({ ...s, face: "multiple" }));
                                const snapshot = captureSnapshot();
                                addFlag("MultipleFaces", `${count} faces detected in the frame — possible third-party assistance.`, snapshot);
                            } else {
                                setStatus(s => ({ ...s, face: "present" }));
                            }

                            const matrix = results?.facialTransformationMatrixes?.[0]?.data;
                            if (matrix) {
                                const yaw = Math.atan2(matrix[8], matrix[10]) * (180 / Math.PI);
                                if (Math.abs(yaw) > 40) {
                                    headTurnFramesRef.current += 1;
                                    if (headTurnFramesRef.current === 3) {
                                        const snapshot = captureSnapshot();
                                        addFlag("GazeDeviation", `Candidate's head turned ${Math.round(Math.abs(yaw))}° away from screen.`, snapshot);
                                    }
                                } else {
                                    headTurnFramesRef.current = 0;
                                }
                            }
                        }
                    } catch {
                        // Video not ready yet, skip frame
                    }
                }
            }

            rafId = requestAnimationFrame(runDetectionLoop);
            animFrameRef.current = rafId;
        }

        const captureSnapshot = (): string | undefined => {
            const video = videoRef.current;
            if (!video || video.readyState < 2) return undefined;
            const canvas = document.createElement("canvas");
            canvas.width = 320;
            canvas.height = 240;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                return canvas.toDataURL("image/jpeg", 0.5);
            }
            return undefined;
        };

        initFaceLandmarker();

        return () => {
            running = false;
            cancelAnimationFrame(animFrameRef.current);
            // Safe close only if reference exists and is not already closing
            if (faceLandmarkerRef.current) {
                const lm = faceLandmarkerRef.current;
                faceLandmarkerRef.current = null;
                try {
                    lm.close();
                } catch (e) {
                    console.warn("MediaPipe close ignored:", e);
                }
            }
        };
    }, [addFlag]);

    // ── 4. TAB VISIBILITY MONITORING ─────────────────────────────────
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                addFlag("TabSwitch", "Candidate switched tabs or minimized the window.");
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [addFlag]);

    // ── 5. MULTI-MONITOR DETECTION ───────────────────────────────────
    useEffect(() => {
        const checkDisplayConfiguration = () => {
            const isExtended = (window.screen as any).isExtended;
            if (isExtended === true) {
                addFlag("MultiMonitorDetected", "Secondary display detected. Multiple monitors are prohibited during this assessment.");
            }
        };
        checkDisplayConfiguration();
        const interval = setInterval(checkDisplayConfiguration, 10000); // Reduced from 5s to 10s
        return () => clearInterval(interval);
    }, [addFlag]);


    const webcamOk = status.webcam === "active";
    const audioOk = status.audio === "active";
    const multipleFaces = status.face === "multiple";

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
            {multipleFaces && (
                <div className="bg-red-600 text-white text-xs font-black px-4 py-2 rounded-xl animate-pulse shadow-lg">
                    ⚠ MULTIPLE PEOPLE DETECTED
                </div>
            )}

            <div className="relative group">
                <div className="w-48 h-32 rounded-2xl overflow-hidden bg-gray-900 border-2 border-[#F97316]/30 shadow-2xl transition-all group-hover:scale-105">
                    {status.webcam === "denied" ? (
                        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                            <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                            <p className="text-[10px] text-white font-bold">Webcam access denied</p>
                        </div>
                    ) : (
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            width={320}
                            height={240}
                            className="w-full h-full object-cover opacity-90"
                        />
                    )}

                    {/* Live dot */}
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                        <div className={`h-1.5 w-1.5 rounded-full ${webcamOk ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                        <span className="text-[10px] font-black text-white uppercase tracking-tighter">Live</span>
                    </div>

                    {/* Bottom status bar */}
                    <div className="absolute bottom-0 left-0 w-full p-2 bg-gradient-to-t from-black/80 to-transparent">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <Camera className="w-3 h-3 text-[#F97316]" />
                                <span className="text-[9px] font-bold text-white/70 uppercase">
                                    {status.face === "present" ? "Face ✓" : status.face === "absent" ? "No Face ⚠" : status.face === "multiple" ? "Multi-face 🚨" : "Scanning..."}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                {audioOk ? <Mic className="w-3 h-3 text-green-400" /> : <MicOff className="w-3 h-3 text-gray-400" />}
                                {flagCount > 0 && (
                                    <span className="text-[9px] font-black text-red-400">{flagCount} flags</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Glow */}
                <div className="absolute -inset-0.5 bg-[#F97316] rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity -z-10" />
            </div>
        </div>
    );
}
