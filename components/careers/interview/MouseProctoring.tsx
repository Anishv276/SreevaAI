"use client";

/**
 * MouseProctoring.tsx
 * -----------------------------------------------------------------------------
 * Silent, background mouse-movement proctoring engine with Deepgram Nova-3
 * cross-signal correlation.
 *
 * Runs entirely in the browser - no raw cursor data is ever sent to the server.
 * Only violation *events* (type + reason + timestamp + severity) are forwarded
 * to the parent's onViolation callback, which handles the API call + data channel.
 *
 * -- How it works ------------------------------------------------------------
 *
 *  SIGNAL 1 - FREEZE DETECTION
 *  If the mouse has not moved for IDLE_THRESHOLD_MS (60 s), the "wasFrozen"
 *  flag is armed. Alone, this is not a violation - a focused candidate may
 *  simply be concentrating on speaking.
 *
 *  SIGNAL 2 - ERRATIC BURST DETECTION
 *  After a freeze, we measure the velocity (px/ms) of the first post-freeze
 *  movement. If velocity > ERRATIC_VEL_THRESHOLD AND the move covers
 *  > MIN_BURST_DISTANCE px, we classify it as an "erratic burst" - a strong
 *  signal that the candidate suddenly snapped attention back to the screen after
 *  receiving off-screen assistance.
 *
 *  SIGNAL 3 - STRAIGHT-LINE SNAP DETECTION
 *  We compute "directness" of the trajectory over TRAJECTORY_WINDOW_MS (500 ms).
 *  A perfectly straight, high-speed path to a specific coordinate is unnatural
 *  for humans and indicates the user was told exactly where to click.
 *
 *  SIGNAL 4 - DEEPGRAM NOVA-3 CROSS-SIGNAL CORRELATION  ← NEW
 *  The parent passes a `candidateSpeakingRef` (a React ref) that reflects
 *  whether Deepgram Nova-3 is currently transcribing speech from the candidate.
 *
 *  When BOTH of the following are true simultaneously:
 *    a) Mouse exhibits an erratic burst or straight-line snap (Signals 1-3)
 *    b) Deepgram has reported candidate SILENCE for ≥ DEEPGRAM_SILENCE_THRESHOLD_MS
 *       immediately preceding the mouse event
 *
 *  ...the engine escalates the violation from "medium" -> "high" severity and
 *  appends a Deepgram-correlation note to the reason string. The rationale:
 *  if the candidate was NOT speaking (Deepgram confirms silence), yet their
 *  mouse suddenly snaps to a precise screen location at high speed, it is
 *  extremely likely they are reading an answer from a helper and clicking on it.
 *
 *  SIGNAL 5 - SILENCE-ONLY ANOMALY DETECTION  ← NEW
 *  If the candidate has been silent (per Deepgram) for > DEEPGRAM_EXTENDED_SILENCE_MS
 *  AND the mouse is simultaneously frozen for > IDLE_THRESHOLD_MS, we emit a
 *  low-severity "mouse_silence_anomaly" event. This catches cases where the
 *  candidate has gone completely still while an off-screen helper dictates.
 *
 * -- False-positive prevention -----------------------------------------------
 *  - IDLE_THRESHOLD_MS: 60 s freeze required - short pauses won't trigger.
 *  - ERRATIC_VEL_THRESHOLD: velocity must be very high (> 3 px/ms).
 *  - MIN_BURST_DISTANCE: movement must cover meaningful screen distance.
 *  - COOLDOWN_MS: 45 s cooldown prevents alert spam.
 *  - Deepgram correlation requires sustained silence - a single breath gap
 *    in speech is not considered silence.
 *  - Only fires during the active interview phase.
 */

import { useEffect, useRef, useCallback } from "react";

// --- Thresholds ---------------------------------------------------------------

/** ms of no mouse movement before the cursor is considered "frozen" */
const IDLE_THRESHOLD_MS = 60_000;   // 60 seconds

/** px/ms - velocity above this after a freeze = erratic burst */
const ERRATIC_VEL_THRESHOLD = 3;    // 3 pixels per millisecond (3000 px/s)

/** Minimum pixel distance a burst must cover to be flagged */
const MIN_BURST_DISTANCE = 150;     // pixels

/**
 * "Directness" ratio threshold for snap detection.
 * Directness = straight-line distance / total path length.
 * 1.0 = perfectly straight; < 0.97 = human-like curve.
 */
const STRAIGHT_LINE_THRESHOLD = 0.97;

/** ms window to keep trajectory samples for straight-line detection */
const TRAJECTORY_WINDOW_MS = 500;

/** After firing, wait this long before firing again (prevent spam) */
const COOLDOWN_MS = 45_000;

/** Polling interval to check for idle + Deepgram silence state (ms) */
const IDLE_CHECK_INTERVAL_MS = 5_000;

// -- Deepgram Nova-3 Cross-Signal Thresholds -----------------------------------

/**
 * If the candidate has been silent (per Deepgram) for at least this long
 * before a mouse burst/snap, upgrade severity to "high" and append a
 * Deepgram-correlation note.
 */
const DEEPGRAM_SILENCE_THRESHOLD_MS = 8_000;   // 8 seconds of silence

/**
 * Extended silence: if silence lasts this long AND mouse is also frozen,
 * emit a soft low-severity "mouse_silence_anomaly" event.
 */
const DEEPGRAM_EXTENDED_SILENCE_MS = 90_000;   // 90 seconds

// -----------------------------------------------------------------------------

interface MouseProctoringProps {
  /** Passed from parent interview page - used for logging */
  applicationId: string;
  interviewToken: string;
  /** Set to true only while the interview phase is active */
  isActive: boolean;
  /**
   * Deepgram Nova-3 cross-signal ref.
   * The parent keeps this ref up-to-date from the LiveKit useTranscriptions hook.
   * .current = timestamp (ms) of the last time a candidate transcript segment
   * arrived. If the candidate has been silent, this will be old.
   * Pass null / leave undefined to disable Deepgram cross-signal correlation.
   */
  lastCandidateTranscriptAtRef?: React.RefObject<number | null>;
  /** Called whenever a violation is detected; parent handles UI + API + data channel */
  onViolation: (
    eventType: string,
    reason: string,
    severity?: "low" | "medium" | "high"
  ) => void;
}

export function MouseProctoring({
  applicationId,
  interviewToken,
  isActive,
  lastCandidateTranscriptAtRef,
  onViolation,
}: MouseProctoringProps) {
  // -- Refs ---------------------------------------------------------------------
  const isActiveRef      = useRef(isActive);
  const mountedRef       = useRef(false);

  // Last known position + timestamp
  const lastXRef         = useRef<number>(0);
  const lastYRef         = useRef<number>(0);
  const lastMoveTimeRef  = useRef<number>(Date.now());

  // Freeze tracking
  const wasFrozenRef     = useRef(false);   // true if idle > IDLE_THRESHOLD_MS

  // Cooldown
  const lastFiredRef     = useRef<number>(0);

  // Silence-anomaly cooldown (separate from burst/snap cooldown)
  const lastSilenceFiredRef = useRef<number>(0);

  // Trajectory buffer [{x, y, t}] for straight-line detection
  type Point = { x: number; y: number; t: number };
  const trajectoryRef    = useRef<Point[]>([]);

  // Idle-check interval handle
  const idleCheckRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep isActive fresh inside event listeners
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  // -- Helpers -------------------------------------------------------------------

  const canFire = useCallback((): boolean => {
    return Date.now() - lastFiredRef.current > COOLDOWN_MS;
  }, []);

  /**
   * Returns how long the candidate has been silent (per Deepgram Nova-3), in ms.
   * Returns 0 if the feature is disabled (no ref passed) or if they spoke recently.
   */
  const getCandidateSilenceMs = useCallback((): number => {
    if (!lastCandidateTranscriptAtRef) return 0;
    const lastAt = lastCandidateTranscriptAtRef.current;
    if (!lastAt) return 0;
    return Math.max(0, Date.now() - lastAt);
  }, [lastCandidateTranscriptAtRef]);

  const fire = useCallback((
    eventType: string,
    reason: string,
    baseSeverity: "low" | "medium" | "high" = "medium"
  ) => {
    if (!canFire()) return;
    lastFiredRef.current = Date.now();

    // -- Deepgram Nova-3 Cross-Signal Correlation ------------------------------
    const silenceMs = getCandidateSilenceMs();
    let severity = baseSeverity;
    let correlatedReason = reason;

    if (silenceMs >= DEEPGRAM_SILENCE_THRESHOLD_MS) {
      // Escalate severity when Deepgram confirms candidate silence
      severity = "high";
      const silenceSec = Math.round(silenceMs / 1000);
      correlatedReason =
        `${reason} [Deepgram Nova-3: candidate silent for ${silenceSec}s - high-confidence off-screen consultation]`;
    }

    if (process.env.NODE_ENV !== "production") {
      console.warn(`[MouseProctoring] ${eventType} (${severity}): ${correlatedReason}`);
    }

    onViolation(eventType, correlatedReason, severity);
  }, [canFire, getCandidateSilenceMs, onViolation]);

  /**
   * Compute the "directness" of the trajectory buffer.
   * directness = straight-line distance from start to end / total path length
   * A value close to 1.0 means the user moved in a perfectly straight line.
   */
  const computeDirectness = useCallback((points: Point[]): number => {
    if (points.length < 2) return 1;
    const first = points[0];
    const last  = points[points.length - 1];

    // Euclidean distance from start to end
    const straightLine = Math.hypot(last.x - first.x, last.y - first.y);
    if (straightLine < 1) return 1;

    // Total path length (sum of consecutive segment lengths)
    let pathLength = 0;
    for (let i = 1; i < points.length; i++) {
      pathLength += Math.hypot(
        points[i].x - points[i - 1].x,
        points[i].y - points[i - 1].y
      );
    }

    return pathLength > 0 ? straightLine / pathLength : 1;
  }, []);

  // -- Event handler -------------------------------------------------------------

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!mountedRef.current || !isActiveRef.current) return;

    const now = Date.now();
    const x   = e.clientX;
    const y   = e.clientY;

    const dx       = x - lastXRef.current;
    const dy       = y - lastYRef.current;
    const distance = Math.hypot(dx, dy);
    const elapsed  = now - lastMoveTimeRef.current;     // ms since last move

    // -- Append to trajectory buffer + prune stale points ---------------------
    trajectoryRef.current.push({ x, y, t: now });
    trajectoryRef.current = trajectoryRef.current.filter(
      (p) => now - p.t <= TRAJECTORY_WINDOW_MS
    );

    // -- Freeze + Erratic Burst Detection -------------------------------------
    if (wasFrozenRef.current && elapsed > 0) {
      // Mouse was frozen. Measure velocity of first post-freeze movement.
      const velocity = distance / elapsed;   // px/ms

      if (velocity > ERRATIC_VEL_THRESHOLD && distance > MIN_BURST_DISTANCE) {
        const frozenSec = Math.round(elapsed / 1000);
        fire(
          "mouse_erratic",
          `Rapid mouse burst (${Math.round(velocity * 1000)} px/s, ${Math.round(distance)} px) ` +
          `after ${frozenSec}s of inactivity - possible off-screen consultation`
        );
      }

      wasFrozenRef.current = false;  // reset freeze state after first move
    }

    // -- Straight-Line Snap Detection -----------------------------------------
    // Only check when moving fast and covering significant distance
    if (distance > MIN_BURST_DISTANCE && elapsed > 0) {
      const velocity    = distance / elapsed;
      const directness  = computeDirectness(trajectoryRef.current);

      if (velocity > ERRATIC_VEL_THRESHOLD && directness >= STRAIGHT_LINE_THRESHOLD) {
        fire(
          "mouse_snap",
          `Unnatural straight-line snap (directness=${directness.toFixed(3)}, ` +
          `speed=${Math.round(velocity * 1000)} px/s, ${Math.round(distance)} px) ` +
          `- possible coordinate-guided click`
        );
      }
    }

    // -- Update last position + time -------------------------------------------
    lastXRef.current       = x;
    lastYRef.current       = y;
    lastMoveTimeRef.current = now;
  }, [fire, computeDirectness]);

  // -- Idle check loop (also runs Deepgram silence-anomaly check) ----------------

  const startIdleCheck = useCallback(() => {
    idleCheckRef.current = setInterval(() => {
      if (!mountedRef.current || !isActiveRef.current) return;

      const now    = Date.now();
      const idleMs = now - lastMoveTimeRef.current;

      // -- Arm freeze flag ---------------------------------------------------
      if (idleMs >= IDLE_THRESHOLD_MS) {
        wasFrozenRef.current = true;
        if (process.env.NODE_ENV !== "production") {
          console.debug(`[MouseProctoring] Cursor frozen for ${Math.round(idleMs / 1000)}s`);
        }
      }

      // -- Deepgram silence-anomaly: mouse frozen + candidate silent ---------
      const silenceMs = getCandidateSilenceMs();
      if (
        wasFrozenRef.current &&
        silenceMs >= DEEPGRAM_EXTENDED_SILENCE_MS &&
        now - lastSilenceFiredRef.current > COOLDOWN_MS
      ) {
        lastSilenceFiredRef.current = now;
        const silenceSec  = Math.round(silenceMs  / 1000);
        const frozenSec   = Math.round(idleMs     / 1000);
        onViolation(
          "mouse_silence_anomaly",
          `Candidate silent for ${silenceSec}s (Deepgram Nova-3) with cursor frozen for ${frozenSec}s ` +
          `- possible dictation from off-screen helper`,
          "low"
        );
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[MouseProctoring] silence_anomaly fired (silence=${silenceSec}s, frozen=${frozenSec}s)`);
        }
      }
    }, IDLE_CHECK_INTERVAL_MS);
  }, [getCandidateSilenceMs, onViolation]);

  // -- Lifecycle ------------------------------------------------------------------

  useEffect(() => {
    if (!isActive) return;

    mountedRef.current        = true;
    wasFrozenRef.current      = false;
    lastFiredRef.current      = 0;
    lastSilenceFiredRef.current = 0;
    lastMoveTimeRef.current   = Date.now();
    trajectoryRef.current     = [];

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    startIdleCheck();

    return () => {
      mountedRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      if (idleCheckRef.current) {
        clearInterval(idleCheckRef.current);
        idleCheckRef.current = null;
      }
    };

    // Only re-run when isActive flips - same pattern as AudioProctoring
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // This component renders nothing - it's a pure side-effect engine
  return null;
}
