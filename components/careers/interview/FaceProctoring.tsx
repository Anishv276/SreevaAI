"use client";

/**
 * FaceProctoring.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Silent, background AI proctoring engine powered by MediaPipe FaceLandmarker.
 * Runs entirely in the browser — no video data is ever sent to the server.
 * Only violation *events* (type + reason + timestamp) are sent to the API.
 *
 * Detects:
 *  1. Face absence        — no face for > 3 s
 *  2. Multiple faces      — > 1 face in frame
 *  3. Gaze violation      — iris looking left/right/up-off-screen for > 3 s
 *  4. Head pose violation — yaw/pitch deviation > threshold for > 3 s
 *  5. Identity mismatch   — face-aligned, grayscale, brightness-normalized
 *                           perceptual diff vs reference snapshot taken during
 *                           hardware check. Runs every 60 s for the full session.
 */

import { useEffect, useRef, useCallback } from "react";
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";

// ─── Landmark indices (MediaPipe 478-point model) ─────────────────────────────
// Iris   left eye:  468 (center), 469 R, 470 B, 471 L, 472 T
// Iris  right eye:  473 (center), 474 R, 475 B, 476 L, 477 T
// Eye corners (left):  33 outer, 133 inner
// Eye corners (right): 362 inner, 263 outer
// Nose tip:            4
// Left ear:            454
// Right ear:           234
// Forehead (approx):   10
// Chin (approx):       152

const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const NOSE_TIP = 4;
const LEFT_EAR = 454;
const RIGHT_EAR = 234;
const FOREHEAD = 10;
const CHIN = 152;

// ─── Thresholds ───────────────────────────────────────────────────────────────
const ABSENCE_GRACE_MS = 3_000;  // 3 s no face → flag
const GAZE_GRACE_MS = 1_500;  // 1.5 s sustained off-screen gaze → flag
const HEAD_POSE_GRACE_MS = 1_500;  // 1.5 s sustained head turn → flag
// Nose-offset thresholds (fraction of face width):
//   |noseOffsetX| > GAZE_X_THRESHOLD  → head turned left/right
//   noseOffsetY  < GAZE_UP_THRESHOLD   → head tilted up
//   noseOffsetY  > GAZE_DOWN_THRESHOLD → head tilted down
const GAZE_X_THRESHOLD = 0.12;   // ~12% of face width off-center
const GAZE_UP_THRESHOLD = -0.06;  // nose 6% above expected neutral Y
const GAZE_DOWN_THRESHOLD = 0.08;  // nose 8% below expected neutral Y
const YAW_THRESHOLD_DEG = 14;     // ~14° horizontal head turn (moderate)
const PITCH_DOWN_THRESHOLD_DEG = 12;     // ~12° head looking down
const PITCH_UP_THRESHOLD_DEG = 10;     // ~10° head looking up
const DETECTION_INTERVAL_MS = 250;    // run detection 4 fps — fast enough for 3s grace
const IDENTITY_CHECK_INTERVAL = 60_000; // face verify every 60 s throughout session
const IDENTITY_FACE_SIZE = 64;     // resize face crop to 64×64 for comparison
const MIN_IDENTITY_PIXEL_DIFF = 0.22;   // perceptual grayscale diff threshold
// Multiple-face debounce: require this many consecutive detections before flagging.
// Eliminates one-frame glitches from reflections, portraits, or shadows.
const MULTI_FACE_CONFIRM_FRAMES = 3;

// ─── Cooldowns (prevent spam) ──────────────────────────────────────────────────
const COOLDOWNS: Record<string, number> = {
  face_absence: 10_000,  // re-alert every 10 s if face still gone
  multiple_faces: 8_000,  // re-alert every 8 s if extra face persists
  gaze_violation: 8_000,
  head_pose_violation: 8_000,
  identity_mismatch: 60_000,
};

interface FaceProctoringProps {
  applicationId: string;
  interviewToken: string;
  /** Set to true only while the interview phase is active */
  isActive: boolean;
  /** base64 dataURL captured during HardwareCheck — used for identity verification */
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
  // ── Refs ────────────────────────────────────────────────────────────────────
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRunRef = useRef(0);
  const mountedRef = useRef(false);
  const isActiveRef = useRef(isActive);

  // Absence tracking
  const absenceStartRef = useRef<number | null>(null);

  // Sustained-violation timers
  const gazeViolStartRef = useRef<number | null>(null);
  const headPoseViolStartRef = useRef<number | null>(null);

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

  // ── Cooldown helper ─────────────────────────────────────────────────────────
  const canFire = useCallback((type: string): boolean => {
    const last = lastFiredRef.current[type] ?? 0;
    return Date.now() - last > (COOLDOWNS[type] ?? 15_000);
  }, []);

  const fire = useCallback((type: string, reason: string, severity?: "low" | "medium" | "high") => {
    if (!canFire(type)) return;
    lastFiredRef.current[type] = Date.now();
    onViolation(type, reason, severity);
  }, [canFire, onViolation]);

  // ── Gaze classification (nose-offset — reliable, mirror-invariant) ──────────────
  // Tracks where the NOSE TIP (lm 4) sits relative to the eye midpoint.
  // This works perfectly for detecting head turns toward another screen/notes.
  const classifyGaze = useCallback((landmarks: { x: number; y: number; z: number }[]): "center" | "left" | "right" | "up" | "down" => {
    try {
      const nose = landmarks[NOSE_TIP];        // 4
      const leftOut = landmarks[LEFT_EYE_OUTER];  // 33
      const rightOut = landmarks[RIGHT_EYE_OUTER]; // 263
      const forehead = landmarks[FOREHEAD];        // 10
      const chin = landmarks[CHIN];            // 152

      // Horizontal: nose x offset from eye midpoint, normalised by face width
      const eyeMidX = (leftOut.x + rightOut.x) / 2;
      const faceWidth = Math.abs(leftOut.x - rightOut.x) || 0.1;
      const noseOffsetX = (nose.x - eyeMidX) / faceWidth; // -0.5 to +0.5

      // Vertical: nose y offset from neutral (~55% of face height)
      const faceHeight = Math.abs(chin.y - forehead.y) || 0.1;
      const neutralNoseY = forehead.y + faceHeight * 0.55;
      const noseOffsetY = (nose.y - neutralNoseY) / faceHeight;

      // Debug — open F12 DevTools → Console to see live values
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[Gaze] noseX=${noseOffsetX.toFixed(3)} noseY=${noseOffsetY.toFixed(3)} | xThr=±${GAZE_X_THRESHOLD}`);
      }

      if (noseOffsetY < GAZE_UP_THRESHOLD) return "up";
      if (noseOffsetY > GAZE_DOWN_THRESHOLD) return "down";
      if (Math.abs(noseOffsetX) > GAZE_X_THRESHOLD) return noseOffsetX > 0 ? "left" : "right";
      return "center";
    } catch {
      return "center";
    }
  }, []);

  // ── Head pose calculation (simplified from landmarks) ──────────────────────
  const classifyHeadPose = useCallback((landmarks: { x: number; y: number; z: number }[]): { yaw: number; pitch: number } => {
    try {
      const nose = landmarks[NOSE_TIP];
      const leftEar = landmarks[LEFT_EAR];
      const rightEar = landmarks[RIGHT_EAR];
      const forehead = landmarks[FOREHEAD];
      const chin = landmarks[CHIN];

      // Yaw: asymmetry between nose and ear midpoint
      const earMidX = (leftEar.x + rightEar.x) / 2;
      const earSpan = Math.abs(rightEar.x - leftEar.x);
      const yawNorm = earSpan < 0.001 ? 0 : (nose.x - earMidX) / earSpan;
      const yaw = yawNorm * 90; // crude degree estimate

      // Pitch: nose vertical position relative to forehead–chin span
      const faceHeight = Math.abs(chin.y - forehead.y);
      const noseRelY = faceHeight < 0.001 ? 0 : (nose.y - forehead.y) / faceHeight;
      // When looking down noseRelY increases; normal ≈ 0.55
      const pitch = (noseRelY - 0.55) * 100; // positive = looking down

      return { yaw, pitch };
    } catch {
      return { yaw: 0, pitch: 0 };
    }
  }, []);

  // ── Helpers: grayscale + brightness normalization ──────────────────────────
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
      // Source canvas — draw only the face crop
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = sw; srcCanvas.height = sh;
      const srcCtx = srcCanvas.getContext("2d");
      if (!srcCtx) return null;
      srcCtx.putImageData(src, -sx, -sy); // offset so the crop region lands at (0,0)

      // Destination canvas — scale to IDENTITY_FACE_SIZE
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

  // ── Identity verification (face-aligned perceptual diff) ───────────────────
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

      if (bw < 32 || bh < 32) return; // face too small — skip

      // -- Current live frame crop → 64×64 --
      const liveResized = cropAndResize(currentFrame, bx, by, bw, bh);
      if (!liveResized) return;

      // -- Reference snapshot crop → 64×64 --
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
          `Face structure differs from verified identity (diff ${(mae * 100).toFixed(0)}%) — possible person swap`,
          "high",
        );
      }
    } catch {
      // Silently ignore — identity check is best-effort
    }
  }, [referenceSnapshotUrl, fire, cropAndResize, toNormalisedGrayscale]);

  // ── Main detection loop ─────────────────────────────────────────────────────
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

    // ── 1. Face Absence ───────────────────────────────────────────────────────
    // If consensus is lost and current frame is 0, start absence timer
    if (numFaces === 0) {
      if (!absenceStartRef.current) absenceStartRef.current = now;
      if (now - absenceStartRef.current > ABSENCE_GRACE_MS) {
        const durSec = Math.round((now - absenceStartRef.current) / 1000);
        fire("face_absence", `No face detected for ${durSec}s during interview`, "high");
      }
      // Reset other sustained timers
      gazeViolStartRef.current = null;
      headPoseViolStartRef.current = null;
      return;
    }

    absenceStartRef.current = null;

    // ── 2. Multiple Faces ─────────────────────────────────────────────────────
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

    // ── 3. Gaze Tracking ──────────────────────────────────────────────────────
    const gazeDir = classifyGaze(landmarks);
    if (gazeDir !== "center") {
      if (!gazeViolStartRef.current) gazeViolStartRef.current = now;
      if (now - gazeViolStartRef.current > GAZE_GRACE_MS) {
        const dirLabel =
          gazeDir === "left" ? "looking left (possible 2nd monitor or notes)" :
            gazeDir === "right" ? "looking right (possible 2nd monitor or notes)" :
              gazeDir === "up" ? "looking up off-screen" :
                "looking down (possible phone or notes)";
        fire("gaze_violation", `Candidate ${dirLabel} for >${GAZE_GRACE_MS / 1000}s`, "medium");
      }
    } else {
      gazeViolStartRef.current = null;
    }

    // ── 4. Head Pose ──────────────────────────────────────────────────────────
    const { yaw, pitch } = classifyHeadPose(landmarks);
    const isHeadPoseViolation =
      Math.abs(yaw) > YAW_THRESHOLD_DEG ||
      pitch > PITCH_DOWN_THRESHOLD_DEG ||
      pitch < -PITCH_UP_THRESHOLD_DEG;

    if (isHeadPoseViolation) {
      if (!headPoseViolStartRef.current) headPoseViolStartRef.current = now;
      if (now - headPoseViolStartRef.current > HEAD_POSE_GRACE_MS) {
        let reason = "";
        if (Math.abs(yaw) > YAW_THRESHOLD_DEG) reason = `Head turned ${yaw > 0 ? "right" : "left"} (yaw ${yaw.toFixed(0)}°)`;
        else if (pitch > PITCH_DOWN_THRESHOLD_DEG) reason = `Looking down — possible phone/notes (pitch ${pitch.toFixed(0)}°)`;
        else reason = `Head tilted up off-screen (pitch ${pitch.toFixed(0)}°)`;
        fire("head_pose_violation", reason, "medium");
      }
    } else {
      headPoseViolStartRef.current = null;
    }

    // ── 5. Periodic Identity Verification ────────────────────────────────────
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
  }, [classifyGaze, classifyHeadPose, verifyIdentity, fire, referenceSnapshotUrl, cropAndResize, toNormalisedGrayscale]);

  // ── Bootstrap: load model + camera ─────────────────────────────────────────
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
          minFaceDetectionConfidence: 0.7,  // raise bar — reduces shadow/reflection FPs
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
        // Silently fail — proctoring is best-effort
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // This component renders nothing — it's a pure side-effect engine
  return null;
}
