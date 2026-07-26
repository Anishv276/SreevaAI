"use client";
import { useEffect, useRef, useCallback } from "react";
import type { RefObject } from "react";
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
const ABSENCE_GRACE_MS = 3_000;
const DETECTION_INTERVAL_MS = 250;
const IDENTITY_CHECK_INTERVAL = 60_000;
const IDENTITY_FACE_SIZE = 64;
const MIN_IDENTITY_PIXEL_DIFF = 0.22;
const MULTI_FACE_CONFIRM_FRAMES = 3;
const COOLDOWNS: Record<string, number> = {
  face_absence: 10_000,
  multiple_faces: 8_000,
  identity_mismatch: 60_000,
  gaze_deviation: 8_000,
};

// ─── Gaze Tracking Constants ───────────────────────────────────────────────
// MediaPipe FaceLandmarker 478-point iris indices (requires minFaceDetectionConfidence
// >= 0.5 and the model to return full landmarks including iris refinement).
const IRIS_R = 468; // right iris center
const IRIS_L = 473; // left iris center
const EYE_R_OUTER = 33;  // right eye outer corner
const EYE_R_INNER = 133; // right eye inner corner (nose side)
const EYE_L_INNER = 362; // left eye inner corner (nose side)
const EYE_L_OUTER = 263; // left eye outer corner
const EYE_R_TOP = 159;   // right upper eyelid
const EYE_R_BOT = 145;   // right lower eyelid
const EYE_L_TOP = 386;   // left upper eyelid
const EYE_L_BOT = 374;   // left lower eyelid

// Number of frames used to build the per-candidate neutral gaze baseline.
// At 250ms/frame this is ~3.75 seconds of normal camera-facing behaviour.
const GAZE_CALIBRATION_FRAMES = 15;

// How many standard tolerance units the iris must deviate from neutral to
// count as an off-gaze frame. Tuned from research across varying webcam
// setups; values below ~0.14 produce too many false positives on subtle
// natural head movement.
const GAZE_H_TOLERANCE = 0.18; // horizontal: ±18 % of eye width from neutral
const GAZE_V_TOLERANCE = 0.20; // vertical:   ±20 % of eye height from neutral

// Number of consecutive off-gaze frames before we promote to a violation.
const GAZE_MINOR_FRAMES  = 2;  // ~0.5 s  → low severity, probe only
const GAZE_MEDIUM_FRAMES = 6;  // ~1.5 s  → medium severity
const GAZE_HIGH_FRAMES   = 12; // ~3.0 s  → sustained look-away, high severity
interface FaceProctoringProps {
  isActive: boolean;
  referenceSnapshotUrl: string | null;
  interviewStartedAt: RefObject<number | null>;
  onViolation: (
    eventType: string,
    reason: string,
    severity: "low" | "medium" | "high" | undefined,
    metadata?: Record<string, unknown>,
  ) => void;
}
export function FaceProctoring({
  isActive,
  referenceSnapshotUrl,
  interviewStartedAt,
  onViolation,
}: FaceProctoringProps) {
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRunRef = useRef(0);
  const mountedRef = useRef(false);
  const isActiveRef = useRef(isActive);
  const absenceStartRef = useRef<number | null>(null);
  const multiFaceCountRef = useRef(0);
  const faceCountHistoryRef = useRef<number[]>([]);
  const lastFiredRef = useRef<Record<string, number>>({});
  const refCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastIdentityCheck = useRef(0);
  const identityCheckCount = useRef(0);

  // ─── Gaze tracking state ────────────────────────────────────────────────
  // Calibration accumulator — filled during the first GAZE_CALIBRATION_FRAMES
  // frames then never written again.
  const gazeCalibSamples = useRef<{ h: number; v: number }[]>([]);
  // Per-person neutral midpoint, set once calibration is complete.
  const gazeNeutral = useRef<{ h: number; v: number } | null>(null);
  // Rolling count of consecutive off-gaze frames (reset when gaze returns).
  const gazeOffFrames = useRef(0);
  // Direction label of the current off-gaze streak for logging.
  const gazeDir = useRef<string>("");

  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  const canFire = useCallback((type: string): boolean => {
    const last = lastFiredRef.current[type] ?? 0;
    return Date.now() - last > (COOLDOWNS[type] ?? 15_000);
  }, []);
  const elapsedLabel = useCallback((now: number): { label: string; seconds: number } | null => {
    const start = interviewStartedAt.current;
    if (!start) return null;
    const seconds = Math.floor((now - start) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return { label: `${mins}m ${secs}s into interview`, seconds };
  }, [interviewStartedAt]);
  const fire = useCallback((
    type: string,
    reason: string,
    severity: "low" | "medium" | "high" | undefined,
    now: number,
  ) => {
    if (!canFire(type)) return;
    lastFiredRef.current[type] = now;
    const elapsed = elapsedLabel(now);
    const fullReason = elapsed ? `${reason} (${elapsed.label})` : reason;
    const metadata: Record<string, unknown> = elapsed
      ? { elapsedSeconds: elapsed.seconds, elapsedLabel: elapsed.label }
      : {};
    onViolation(type, fullReason, severity, metadata);
  }, [canFire, elapsedLabel, onViolation]);
  const toNormalisedGrayscale = useCallback((data: Uint8ClampedArray, pixels: number): Float32Array => {
    const gray = new Float32Array(pixels);
    let sum = 0;
    for (let i = 0; i < pixels; i++) {
      const lum = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
      gray[i] = lum;
      sum += lum;
    }
    const shift = 0.5 - sum / pixels;
    for (let i = 0; i < pixels; i++) gray[i] = Math.min(1, Math.max(0, gray[i] + shift));
    return gray;
  }, []);
  const cropAndResize = useCallback((
    src: ImageData,
    sx: number, sy: number, sw: number, sh: number,
  ): Uint8ClampedArray | null => {
    try {
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = sw; srcCanvas.height = sh;
      const srcCtx = srcCanvas.getContext("2d");
      if (!srcCtx) return null;
      srcCtx.putImageData(src, -sx, -sy);
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
  const verifyIdentity = useCallback(async (
    currentFrame: ImageData,
    faceBox: { x: number; y: number; w: number; h: number },
    now: number,
  ) => {
    if (!referenceSnapshotUrl || !refCanvasRef.current) return;
    try {
      const refCtx = refCanvasRef.current.getContext("2d");
      if (!refCtx) return;
      const vw = currentFrame.width;
      const vh = currentFrame.height;
      const bx = Math.max(0, Math.floor(faceBox.x));
      const by = Math.max(0, Math.floor(faceBox.y));
      const bw = Math.min(vw - bx, Math.max(32, Math.floor(faceBox.w)));
      const bh = Math.min(vh - by, Math.max(32, Math.floor(faceBox.h)));
      if (bw < 32 || bh < 32) return;
      const liveResized = cropAndResize(currentFrame, bx, by, bw, bh);
      if (!liveResized) return;
      const refFrame = refCtx.getImageData(0, 0, refCanvasRef.current.width, refCanvasRef.current.height);
      const refResized = cropAndResize(refFrame, bx, by, bw, bh);
      if (!refResized) return;
      const pixels = IDENTITY_FACE_SIZE * IDENTITY_FACE_SIZE;
      const liveGray = toNormalisedGrayscale(liveResized, pixels);
      const refGray = toNormalisedGrayscale(refResized, pixels);
      let totalDiff = 0;
      for (let i = 0; i < pixels; i++) totalDiff += Math.abs(liveGray[i] - refGray[i]);
      const mae = totalDiff / pixels;
      if (mae > MIN_IDENTITY_PIXEL_DIFF) {
        fire(
          "identity_mismatch",
          `Face structure differs from verified identity (diff ${(mae * 100).toFixed(0)}%) - possible person swap`,
          "high",
          now,
        );
      }
    } catch {
      // identity check is best-effort
    }
  }, [referenceSnapshotUrl, fire, cropAndResize, toNormalisedGrayscale]);
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
    faceCountHistoryRef.current.push(numFaces);
    if (faceCountHistoryRef.current.length > 5) faceCountHistoryRef.current.shift();
    const isIdentityLocked = faceCountHistoryRef.current.filter(c => c === 1).length >= 3;
    // 1. Face Absence
    if (numFaces === 0) {
      if (!absenceStartRef.current) absenceStartRef.current = now;
      if (now - absenceStartRef.current > ABSENCE_GRACE_MS) {
        const durSec = Math.round((now - absenceStartRef.current) / 1000);
        fire("face_absence", `No face detected for ${durSec}s`, "high", now);
      }
      return;
    }
    absenceStartRef.current = null;
    // 2. Multiple Faces
    if (numFaces > 1) {
      multiFaceCountRef.current += 1;
      if (multiFaceCountRef.current >= MULTI_FACE_CONFIRM_FRAMES) {
        fire("multiple_faces", `${numFaces} people detected in frame`, "high", now);
      }
    } else {
      multiFaceCountRef.current = 0;
    }
    if (!isIdentityLocked) return;
    const landmarks = result.faceLandmarks[0];
    if (!landmarks || landmarks.length < 478) return;
    // 3. Periodic Identity Verification
    if (referenceSnapshotUrl && now - lastIdentityCheck.current > IDENTITY_CHECK_INTERVAL) {
      lastIdentityCheck.current = now;
      identityCheckCount.current += 1;
      const face = result.faceLandmarks[0];
      const xs = face.map(l => l.x * video.videoWidth);
      const ys = face.map(l => l.y * video.videoHeight);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const padX = (maxX - minX) * 0.2;
      const padY = (maxY - minY) * 0.2;
      const capCanvas = document.createElement("canvas");
      capCanvas.width = video.videoWidth;
      capCanvas.height = video.videoHeight;
      const capCtx = capCanvas.getContext("2d");
      if (capCtx) {
        capCtx.drawImage(video, 0, 0);
        void verifyIdentity(
          capCtx.getImageData(0, 0, capCanvas.width, capCanvas.height),
          { x: minX - padX, y: minY - padY, w: (maxX - minX) + padX * 2, h: (maxY - minY) + padY * 2 },
          now,
        );
      }
    }

    // ─── 4. Gaze Deviation Tracking ────────────────────────────────────────
    // We only need the iris centres and the four eye corners — all values are
    // already normalised to [0,1] by MediaPipe so ratios cancel out perfectly
    // without any pixel-space conversion.
    const lm = landmarks;

    // Helper: clamp a ratio to avoid divide-by-zero when landmarks overlap.
    const safeDivide = (num: number, den: number) =>
      Math.abs(den) < 1e-6 ? 0.5 : num / den;

    // ── RIGHT EYE ──
    const rIris  = lm[IRIS_R];
    const rOuter = lm[EYE_R_OUTER];
    const rInner = lm[EYE_R_INNER];
    const rTop   = lm[EYE_R_TOP];
    const rBot   = lm[EYE_R_BOT];
    // Mirror: webcam is horizontally flipped, so "outer" in pixel space is
    // actually toward the nose — swap inner/outer for ratio to read L→R naturally.
    const rH = safeDivide(rIris.x - rOuter.x, rInner.x - rOuter.x);
    const rV = safeDivide(rIris.y - rTop.y,   rBot.y   - rTop.y);

    // ── LEFT EYE ──
    const lIris  = lm[IRIS_L];
    const lOuter = lm[EYE_L_OUTER];
    const lInner = lm[EYE_L_INNER];
    const lTop   = lm[EYE_L_TOP];
    const lBot   = lm[EYE_L_BOT];
    const lH = safeDivide(lIris.x - lInner.x, lOuter.x - lInner.x);
    const lV = safeDivide(lIris.y - lTop.y,   lBot.y   - lTop.y);

    // Average both eyes — averaging eliminates single-eye detection noise.
    const avgH = (rH + lH) / 2;
    const avgV = (rV + lV) / 2;

    // ── CALIBRATION (first GAZE_CALIBRATION_FRAMES frames) ──
    if (gazeCalibSamples.current.length < GAZE_CALIBRATION_FRAMES) {
      gazeCalibSamples.current.push({ h: avgH, v: avgV });
      if (gazeCalibSamples.current.length === GAZE_CALIBRATION_FRAMES) {
        // Compute median of collected samples (robust against outlier blinks).
        const hs = [...gazeCalibSamples.current.map(s => s.h)].sort((a, b) => a - b);
        const vs = [...gazeCalibSamples.current.map(s => s.v)].sort((a, b) => a - b);
        const mid = Math.floor(GAZE_CALIBRATION_FRAMES / 2);
        gazeNeutral.current = { h: hs[mid], v: vs[mid] };
      }
      // Skip violation logic until calibration is complete.
    } else if (gazeNeutral.current) {
      const { h: nh, v: nv } = gazeNeutral.current;
      const hDev = avgH - nh; // positive = looking left, negative = right
      const vDev = avgV - nv; // positive = looking down, negative = up

      const isOffH = Math.abs(hDev) > GAZE_H_TOLERANCE;
      const isOffV = Math.abs(vDev) > GAZE_V_TOLERANCE;
      const isOff  = isOffH || isOffV;

      if (isOff) {
        gazeOffFrames.current += 1;

        // Build a human-readable direction label for the violation reason.
        const hLabel = hDev > 0 ? "left" : "right";
        const vLabel = vDev > 0 ? "down" : "up";
        const dirLabel = isOffH && isOffV
          ? `${vLabel}-${hLabel}`
          : isOffH ? hLabel : vLabel;
        gazeDir.current = dirLabel;

        const frames = gazeOffFrames.current;

        if (frames === GAZE_HIGH_FRAMES) {
          // Sustained 3-second look-away — high severity.
          fire(
            "gaze_deviation",
            `Candidate sustained gaze ${gazeDir.current} for ~3 seconds — possible off-screen reference`,
            "high",
            now,
          );
        } else if (frames === GAZE_MEDIUM_FRAMES) {
          // 1.5-second deviation — medium severity probe.
          fire(
            "gaze_deviation",
            `Candidate eyes directed ${gazeDir.current} for ~1.5 seconds`,
            "medium",
            now,
          );
        } else if (frames === GAZE_MINOR_FRAMES) {
          // 0.5-second micro-deviation — low severity, logged for pattern scoring.
          fire(
            "gaze_deviation",
            `Brief gaze shift ${gazeDir.current} detected`,
            "low",
            now,
          );
        }
      } else {
        // Gaze returned to neutral zone — reset streak counter.
        gazeOffFrames.current = 0;
        gazeDir.current = "";
      }
    }
    // ─── End Gaze Tracking ─────────────────────────────────────────────────
  }, [verifyIdentity, fire, referenceSnapshotUrl]);
  useEffect(() => {
    if (!isActive) return;
    mountedRef.current = true;
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const { FaceLandmarker: FL, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks("/mediapipe");
        if (cancelled) return;
        const landmarker = await FL.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate: "GPU" },
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
          runningMode: "VIDEO",
          numFaces: 2,
          minFaceDetectionConfidence: 0.7,
          minFacePresenceConfidence: 0.7,
          minTrackingConfidence: 0.6,
        });
        if (cancelled) { landmarker.close(); return; }
        landmarkerRef.current = landmarker;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const video = document.createElement("video");
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.width = 640;
        video.height = 480;
        await video.play();
        videoRef.current = video;
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
        rafRef.current = requestAnimationFrame(detectFrame);
      } catch (err) {
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
  }, [isActive]);
  return null;
}