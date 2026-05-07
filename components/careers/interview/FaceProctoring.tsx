"use client";



/**

 * FaceProctoring.tsx

 * 

 * Silent, background AI proctoring engine powered by MediaPipe FaceLandmarker.

 * Runs entirely in the browser - no video data is ever sent to the server.

 * Only violation *events* (type + reason + timestamp) are sent to the API.

 *

 * Detects:

 *  1. Face absence        - no face for > 3 s

 *  2. Multiple faces      - > 1 face in frame

 *  3. Identity mismatch   - face-aligned, grayscale, brightness-normalized

 *                           perceptual diff vs reference snapshot taken during

 *                           hardware check. Runs every 60 s for the full session.

 */



import { useEffect, useRef, useCallback } from "react";

import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";



//  Thresholds 

const ABSENCE_GRACE_MS = 3_000;  // 3 s no face -> flag
const DETECTION_INTERVAL_MS = 250;    // run detection 4 fps - fast enough for 3s grace

const IDENTITY_CHECK_INTERVAL = 60_000; // face verify every 60 s throughout session

const IDENTITY_FACE_SIZE = 64;     // resize face crop to 64×64 for comparison

const MIN_IDENTITY_PIXEL_DIFF = 0.22;   // perceptual grayscale diff threshold

// Multiple-face debounce: require this many consecutive detections before flagging.

// Eliminates one-frame glitches from reflections, portraits, or shadows.

const MULTI_FACE_CONFIRM_FRAMES = 3;



//  Cooldowns (prevent spam) 

const COOLDOWNS: Record<string, number> = {

  face_absence: 10_000,  // re-alert every 10 s if face still gone

  multiple_faces: 8_000,  // re-alert every 8 s if extra face persists

  identity_mismatch: 60_000,

};



interface FaceProctoringProps {

  applicationId: string;

  interviewToken: string;

  /** Set to true only while the interview phase is active */

  isActive: boolean;

  /** base64 dataURL captured during HardwareCheck - used for identity verification */

  referenceSnapshotUrl: string | null;

  /** Called whenever a violation is detected; parent handles UI + API call */

  onViolation: (eventType: string, reason: string, severity?: "low" | "medium" | "high") => void;

}



export function FaceProctoring({

  applicationId,

  interviewToken,

  isActive,

  referenceSnapshotUrl,


  onViolation,

}: FaceProctoringProps) {

  //  Refs 

  const landmarkerRef = useRef<FaceLandmarker | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  const rafRef = useRef<number | null>(null);

  const lastRunRef = useRef(0);

  const mountedRef = useRef(false);

  const isActiveRef = useRef(isActive);



  // Absence tracking

  const absenceStartRef = useRef<number | null>(null);



  // Multiple-face consecutive-frame counter (debounce false positives)

  const multiFaceCountRef = useRef(0);

  const faceCountHistoryRef = useRef<number[]>([]); // 5-frame buffer for temporal consensus



  // Cooldown timestamps

  const lastFiredRef = useRef<Record<string, number>>({});



  // Identity verification

  const refCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const lastIdentityCheck = useRef(0);

  const identityCheckCount = useRef(0);



  // Keep isActive in a ref so the RAF loop always reads the latest value

  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);



  //  Cooldown helper 

  const canFire = useCallback((type: string): boolean => {

    const last = lastFiredRef.current[type] ?? 0;

    return Date.now() - last > (COOLDOWNS[type] ?? 15_000);

  }, []);



  const fire = useCallback((type: string, reason: string, severity?: "low" | "medium" | "high") => {

    if (!canFire(type)) return;

    lastFiredRef.current[type] = Date.now();

    onViolation(type, reason, severity);

  }, [canFire, onViolation]);


  //  Helpers: grayscale + brightness normalization 

  /**

   * Converts raw RGBA ImageData to a Float32Array of grayscale values [0..1].

   * Then normalises brightness so that lighting changes don't trigger false positives:

   *   • compute mean brightness of all pixels

   *   • shift every pixel by (0.5 - mean) so the average is always 0.5

   * This ensures that if the room gets brighter/darker between the reference snapshot

   * and the current frame, the diff remains low for the same person.

   */

  const toNormalisedGrayscale = useCallback((data: Uint8ClampedArray, pixels: number): Float32Array => {

    const gray = new Float32Array(pixels);

    let sum = 0;

    for (let i = 0; i < pixels; i++) {

      const r = data[i * 4];

      const g = data[i * 4 + 1];

      const b = data[i * 4 + 2];

      // Perceptual luminance weights (ITU-R BT.601)

      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      gray[i] = lum;

      sum += lum;

    }

    const mean = sum / pixels;

    const shift = 0.5 - mean;

    for (let i = 0; i < pixels; i++) gray[i] = Math.min(1, Math.max(0, gray[i] + shift));

    return gray;

  }, []);



  /**

   * Draws a region of an ImageData onto a temporary canvas, then scales it to

   * IDENTITY_FACE_SIZE × IDENTITY_FACE_SIZE and returns the pixel data.

   */

  const cropAndResize = useCallback((

    src: ImageData,

    sx: number, sy: number, sw: number, sh: number,

  ): Uint8ClampedArray | null => {

    try {

      // Source canvas - draw only the face crop

      const srcCanvas = document.createElement("canvas");

      srcCanvas.width = sw; srcCanvas.height = sh;

      const srcCtx = srcCanvas.getContext("2d");

      if (!srcCtx) return null;

      srcCtx.putImageData(src, -sx, -sy); // offset so the crop region lands at (0,0)



      // Destination canvas - scale to IDENTITY_FACE_SIZE

      const dstCanvas = document.createElement("canvas");

      dstCanvas.width = IDENTITY_FACE_SIZE;

      dstCanvas.height = IDENTITY_FACE_SIZE;

      const dstCtx = dstCanvas.getContext("2d");

      if (!dstCtx) return null;

      dstCtx.drawImage(srcCanvas, 0, 0, IDENTITY_FACE_SIZE, IDENTITY_FACE_SIZE);

      return dstCtx.getImageData(0, 0, IDENTITY_FACE_SIZE, IDENTITY_FACE_SIZE).data;

    } catch {

      return null;

    }

  }, []);



  //  Identity verification (face-aligned perceptual diff) 

  /**

   * Algorithm:

   *  1. Use the MediaPipe face bounding box to crop only the face from both

   *     the reference snapshot (pre-rendered onto refCanvasRef) and the current frame.

   *  2. Resize both crops to 64×64 pixels.

   *  3. Convert to grayscale and normalise brightness.

   *  4. Compute the Mean Absolute Error between the two grayscale images.

   *  5. Flag identity_mismatch if MAE > MIN_IDENTITY_PIXEL_DIFF.

   *

   * Why this is robust:

   *  - Cropping prevents background changes from contributing to the diff.

   *  - Resizing makes it invariant to small head movements.

   *  - Grayscale + brightness normalisation removes lighting-change false positives.

   *  - MAE is a simple, fast metric that works well for face identity without ML.

   */

  const verifyIdentity = useCallback(async (

    currentFrame: ImageData,

    faceBox: { x: number; y: number; w: number; h: number },

  ) => {

    if (!referenceSnapshotUrl || !refCanvasRef.current) return;

    try {

      const refCanvas = refCanvasRef.current;

      const refCtx = refCanvas.getContext("2d");

      if (!refCtx) return;



      // Clamp face box to canvas bounds

      const vw = currentFrame.width;

      const vh = currentFrame.height;

      const bx = Math.max(0, Math.floor(faceBox.x));

      const by = Math.max(0, Math.floor(faceBox.y));

      const bw = Math.min(vw - bx, Math.max(32, Math.floor(faceBox.w)));

      const bh = Math.min(vh - by, Math.max(32, Math.floor(faceBox.h)));



      if (bw < 32 || bh < 32) return; // face too small - skip



      // -- Current live frame crop -> 64×64 --

      const liveResized = cropAndResize(currentFrame, bx, by, bw, bh);

      if (!liveResized) return;



      // -- Reference snapshot crop -> 64×64 --

      // The reference canvas is 640×480, same coordinate space as the video.

      const refFrame = refCtx.getImageData(0, 0, refCanvas.width, refCanvas.height);

      const refResized = cropAndResize(refFrame, bx, by, bw, bh);

      if (!refResized) return;



      const pixels = IDENTITY_FACE_SIZE * IDENTITY_FACE_SIZE;



      // -- Convert both to normalised grayscale --

      const liveGray = toNormalisedGrayscale(liveResized, pixels);

      const refGray = toNormalisedGrayscale(refResized, pixels);



      // -- Mean Absolute Error --

      let totalDiff = 0;

      for (let i = 0; i < pixels; i++) {

        totalDiff += Math.abs(liveGray[i] - refGray[i]);

      }

      const mae = totalDiff / pixels; // 0..1



      console.debug(`[FaceProctoring] Identity MAE: ${(mae * 100).toFixed(1)}%`);



      if (mae > MIN_IDENTITY_PIXEL_DIFF) {

        fire(

          "identity_mismatch",

          `Face structure differs from verified identity (diff ${(mae * 100).toFixed(0)}%) - possible person swap`,

          "high",

        );

      }

    } catch {

      // Silently ignore - identity check is best-effort

    }

  }, [referenceSnapshotUrl, fire, cropAndResize, toNormalisedGrayscale]);



  //  Main detection loop 

  const detectFrame = useCallback(() => {

    if (!mountedRef.current) return;

    rafRef.current = requestAnimationFrame(detectFrame);



    if (!isActiveRef.current) return;

    const now = Date.now();

    if (now - lastRunRef.current < DETECTION_INTERVAL_MS) return;

    lastRunRef.current = now;



    const landmarker = landmarkerRef.current;

    const video = videoRef.current;

    if (!landmarker || !video || video.readyState < 2 || video.paused) return;



    let result: FaceLandmarkerResult;

    try {

      result = landmarker.detectForVideo(video, now);

    } catch {

      return;

    }



    const numFaces = result.faceLandmarks?.length ?? 0;



    // -- Signal 03: Identity Lock (Temporal Consensus 3/5) --

    faceCountHistoryRef.current.push(numFaces);

    if (faceCountHistoryRef.current.length > 5) faceCountHistoryRef.current.shift();



    const validFrames = faceCountHistoryRef.current.filter(c => c === 1).length;

    const isIdentityLocked = validFrames >= 3;



    //  1. Face Absence 

    // If consensus is lost and current frame is 0, start absence timer

    if (numFaces === 0) {

      if (!absenceStartRef.current) absenceStartRef.current = now;

      if (now - absenceStartRef.current > ABSENCE_GRACE_MS) {

        const durSec = Math.round((now - absenceStartRef.current) / 1000);

        fire("face_absence", `No face detected for ${durSec}s during interview`, "high");

      }

      return;

    }



    absenceStartRef.current = null;



    //  2. Multiple Faces 

    // If consensus is lost and current frame is > 1, track multiple faces

    if (numFaces > 1) {

      multiFaceCountRef.current += 1;

      if (multiFaceCountRef.current >= MULTI_FACE_CONFIRM_FRAMES) {

        fire("multiple_faces", `${numFaces} people detected in frame`, "high");

      }

    } else {

      multiFaceCountRef.current = 0;

    }



    // Only proceed to Gaze/Pose if Identity is Locked (1 face stable)

    if (!isIdentityLocked) return;



    // Use primary face (index 0) for gaze + pose

    const landmarks = result.faceLandmarks[0];

    if (!landmarks || landmarks.length < 478) return;



    //  3. Periodic Identity Verification 

    // Runs every 60 s for the entire interview session (no arbitrary cap).

    if (referenceSnapshotUrl && now - lastIdentityCheck.current > IDENTITY_CHECK_INTERVAL) {

      lastIdentityCheck.current = now;

      identityCheckCount.current += 1;



      // Derive face bounding box from landmarks (in pixel coords)

      const face = result.faceLandmarks[0];

      const xs = face.map(l => l.x * video.videoWidth);

      const ys = face.map(l => l.y * video.videoHeight);

      const minX = Math.min(...xs), maxX = Math.max(...xs);

      const minY = Math.min(...ys), maxY = Math.max(...ys);



      // Add 20% padding around the bounding box to include forehead / chin

      const padX = (maxX - minX) * 0.2;

      const padY = (maxY - minY) * 0.2;



      // Capture the current video frame onto an off-screen canvas

      const capCanvas = document.createElement("canvas");

      capCanvas.width = video.videoWidth;

      capCanvas.height = video.videoHeight;

      const capCtx = capCanvas.getContext("2d");

      if (capCtx) {

        capCtx.drawImage(video, 0, 0);

        const frameData = capCtx.getImageData(0, 0, capCanvas.width, capCanvas.height);

        void verifyIdentity(frameData, {

          x: minX - padX,

          y: minY - padY,

          w: (maxX - minX) + padX * 2,

          h: (maxY - minY) + padY * 2,

        });

      }

    }

  }, [verifyIdentity, fire, referenceSnapshotUrl, cropAndResize, toNormalisedGrayscale]);



  //  Bootstrap: load model + camera 

  useEffect(() => {

    if (!isActive) return;

    mountedRef.current = true;



    let cancelled = false;



    const bootstrap = async () => {

      try {

        // 1. Dynamically import MediaPipe (avoids SSR issues)

        const { FaceLandmarker: FL, FilesetResolver } = await import("@mediapipe/tasks-vision");



        const vision = await FilesetResolver.forVisionTasks(

          "/mediapipe"

        );



        if (cancelled) return;



        const landmarker = await FL.createFromOptions(vision, {

          baseOptions: {

            modelAssetPath: "/models/face_landmarker.task",

            delegate: "GPU",

          },

          outputFaceBlendshapes: false,

          outputFacialTransformationMatrixes: false,

          runningMode: "VIDEO",

          numFaces: 2,               // detect up to 2 to catch multiple-face scenario

          minFaceDetectionConfidence: 0.7,  // raise bar - reduces shadow/reflection FPs

          minFacePresenceConfidence: 0.7,  // must be consistently present

          minTrackingConfidence: 0.6,  // stable tracking

        });



        if (cancelled) { landmarker.close(); return; }

        landmarkerRef.current = landmarker;



        // 2. Get camera stream (reuse existing if possible; getUserMedia is cheap here)

        const stream = await navigator.mediaDevices.getUserMedia({

          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },

          audio: false,

        });

        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;



        // 3. Create hidden video element

        const video = document.createElement("video");

        video.srcObject = stream;

        video.muted = true;

        video.playsInline = true;

        video.width = 640;

        video.height = 480;

        await video.play();

        videoRef.current = video;



        // 4. Pre-render reference snapshot to canvas for identity comparison

        if (referenceSnapshotUrl) {

          const refCanvas = document.createElement("canvas");

          refCanvas.width = 640;

          refCanvas.height = 480;

          const refCtx = refCanvas.getContext("2d");

          if (refCtx) {

            const img = new Image();

            img.onload = () => { refCtx.drawImage(img, 0, 0, 640, 480); };

            img.src = referenceSnapshotUrl;

          }

          refCanvasRef.current = refCanvas;

        }



        // 5. Start detection loop

        rafRef.current = requestAnimationFrame(detectFrame);



      } catch (err) {

        // Silently fail - proctoring is best-effort

        if (process.env.NODE_ENV !== "production") {

          console.warn("[FaceProctoring] bootstrap error:", err);

        }

      }

    };



    void bootstrap();



    return () => {

      cancelled = true;

      mountedRef.current = false;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      streamRef.current?.getTracks().forEach(t => t.stop());

      if (landmarkerRef.current) {

        try { landmarkerRef.current.close(); } catch { }

        landmarkerRef.current = null;

      }

      videoRef.current = null;

    };

    // We intentionally run this only when isActive flips to true

     

  }, [isActive]);



  // This component renders nothing - it's a pure side-effect engine

  return null;

}







