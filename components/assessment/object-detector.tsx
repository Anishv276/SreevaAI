"use client";

import { useEffect, useRef } from "react";

// Banned objects by COCO category name
const BANNED_OBJECTS = ["cell phone", "book", "laptop", "remote", "tablet"];
const CONFIDENCE_THRESHOLD = 0.55;
const DETECTION_INTERVAL_MS = 5000; // Increased from 2s to 5s to reduce CPU/lag

interface ObjectDetectorProps {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    onFlag: (type: string, reason: string, screenshot?: string) => void;
}

export function ProctorObjectDetector({ videoRef, onFlag }: ObjectDetectorProps) {
    const detectorRef = useRef<any>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastFlaggedRef = useRef<Record<string, number>>({});

    useEffect(() => {
        let destroyed = false;

        async function initDetector() {
            try {
                const { ObjectDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");

                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
                );

                detectorRef.current = await ObjectDetector.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
                        delegate: "GPU",
                    },
                    runningMode: "IMAGE",
                    scoreThreshold: CONFIDENCE_THRESHOLD,
                });

                if (!destroyed) {
                    startDetectionLoop();
                }
            } catch (err) {
                console.warn("Object detector init failed:", err);
            }
        }

        function startDetectionLoop() {
            intervalRef.current = setInterval(() => {
                const video = videoRef.current;
                if (!video || !detectorRef.current || video.readyState < 2) return;

                try {
                    const results = detectorRef.current.detect(video);
                    for (const detection of results.detections ?? []) {
                        const label = detection.categories?.[0]?.categoryName?.toLowerCase() ?? "";
                        const score = detection.categories?.[0]?.score ?? 0;

                        if (BANNED_OBJECTS.includes(label) && score >= CONFIDENCE_THRESHOLD) {
                            // Rate-limit: only flag the same object once per 30 seconds
                            const lastTime = lastFlaggedRef.current[label] ?? 0;
                            if (Date.now() - lastTime > 30_000) {
                                lastFlaggedRef.current[label] = Date.now();
                                
                                // Capture screenshot
                                const canvas = document.createElement("canvas");
                                canvas.width = 320;
                                canvas.height = 240;
                                const ctx = canvas.getContext("2d");
                                let screenshot = undefined;
                                if (ctx) {
                                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                                    screenshot = canvas.toDataURL("image/jpeg", 0.6);
                                }

                                onFlag(
                                    "BannedObjectDetected",
                                    `Prohibited item detected in webcam: "${label}" (${Math.round(score * 100)}% confidence).`,
                                    screenshot
                                );
                            }
                        }
                    }
                } catch {
                    // Frame not ready, skip
                }
            }, DETECTION_INTERVAL_MS);
        }

        initDetector();

        return () => {
            destroyed = true;
            if (intervalRef.current) clearInterval(intervalRef.current);
            detectorRef.current?.close?.();
        };
    }, [videoRef, onFlag]);

    // This component renders nothing — it only monitors in the background
    return null;
}
