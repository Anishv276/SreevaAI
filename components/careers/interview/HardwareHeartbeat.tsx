"use client";

/**
 * HardwareHeartbeat.tsx
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Silent proctoring engine that monitors camera and microphone hardware state
 * using the native MediaStreamTrack API.
 *
 * WHY a SEPARATE monitor stream (not LiveKit's stream)?
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * LiveKit's UI mute button calls its own internal track.mute() which does NOT
 * fire a hardware-level event on our independent monitor stream.
 *
 * By opening a tiny, hidden getUserMedia stream purely for monitoring, we
 * listen ONLY to OS/hardware-level changes:
 *   - Candidate covers camera with a sticker / privacy shutter â†’ muted event
 *   - System privacy permission revoked (Settings â†’ Camera â†’ Off) â†’ ended event
 *   - Camera physically unplugged from USB â†’ ended event
 *   - OS mutes microphone input (e.g., keyboard shortcut, system tray) â†’ muted
 *
 * This correctly ignores:
 *   - LiveKit's software "Mute Mic" button (valid in-interview action)
 *   - FaceProctoring's own camera stream (stays independent)
 *
 * Events fired:
 *   camera_disabled       â€” severity: high
 *   microphone_disabled   â€” severity: high (changed from medium)
 *
 * Signal lifecycle:
 *   muted  â†’ grace timer starts (4 s) â†’ if still muted â†’ fire violation
 *   unmute â†’ grace timer cancelled (transient glitch prevention)
 *   ended  â†’ immediate flag (hardware disconnect â€” no grace needed)
 */

import { useEffect, useRef, useCallback } from "react";

// â”€â”€â”€ Thresholds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** ms a track must remain muted before we consider it a real violation */
const MUTE_GRACE_MS = 4_000;

/** After a violation fires for a given track type, wait before firing again */
const COOLDOWN_MS = 30_000;

/** Polling interval to double-check track state (catches cases where browser
 *  doesn't reliably fire the unmute event after a permission re-grant) */
const POLL_INTERVAL_MS = 5_000;

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface HardwareHeartbeatProps {
  applicationId: string;
  interviewToken: string;
  /** Set to true only while the interview phase is active */
  isActive: boolean;
  /** Callback to parent â€” same signature as FaceProctoring / AudioProctoring */
  onViolation: (
    eventType: string,
    reason: string,
    severity?: "low" | "medium" | "high"
  ) => void;
}

// â”€â”€â”€ Per-track monitor state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface TrackMonitor {
  track: MediaStreamTrack;
  kind: "video" | "audio";
  graceTimer: ReturnType<typeof setTimeout> | null;
  lastFired: number;
}

export function HardwareHeartbeat({
  isActive,
  onViolation,
}: HardwareHeartbeatProps) {
  const mountedRef    = useRef(false);
  const isActiveRef   = useRef(isActive);
  const streamRef     = useRef<MediaStream | null>(null);
  const monitorsRef   = useRef<TrackMonitor[]>([]);
  const pollTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  // â”€â”€ Event type helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const eventTypeFor = (kind: "video" | "audio") =>
    kind === "video" ? "camera_disabled" : "microphone_disabled";

  const labelFor = (kind: "video" | "audio") =>
    kind === "video" ? "Camera" : "Microphone";

  // â”€â”€ Cooldown helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const canFire = useCallback((monitor: TrackMonitor): boolean => {
    return Date.now() - monitor.lastFired > COOLDOWN_MS;
  }, []);

  // â”€â”€ Fire violation helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fire = useCallback((monitor: TrackMonitor, cause: "muted" | "ended") => {
    if (!canFire(monitor)) return;
    monitor.lastFired = Date.now();

    const label  = labelFor(monitor.kind);
    const evType = eventTypeFor(monitor.kind);
    const reason =
      cause === "ended"
        ? `${label} hardware disconnected or permission revoked during interview`
        : `${label} was disabled at the OS/hardware level during interview`;

    onViolation(evType, reason, "high");
  }, [canFire, onViolation]);

  // â”€â”€ Attach listeners to a single MediaStreamTrack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const attachMonitor = useCallback(
    (track: MediaStreamTrack, kind: "video" | "audio") => {
      const monitor: TrackMonitor = {
        track,
        kind,
        graceTimer: null,
        lastFired:  0,
      };
      monitorsRef.current.push(monitor);

      // â”€â”€ "muted" event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Fires when the hardware source becomes temporarily unavailable.
      // We don't flag immediately â€” wait MUTE_GRACE_MS to rule out brief
      // system permission re-checks or device hand-offs between apps.
      const onMute = () => {
        if (!isActiveRef.current || !mountedRef.current) return;
        if (monitor.graceTimer) return; // grace already running

        monitor.graceTimer = setTimeout(() => {
          monitor.graceTimer = null;
          // Re-check: only fire if the track is STILL muted after grace
          if (track.muted && track.readyState === "live") {
            fire(monitor, "muted");
          }
        }, MUTE_GRACE_MS);
      };

      // â”€â”€ "unmute" event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Hardware became available again â€” cancel the grace timer so we don't
      // fire a false positive for a transient OS permission re-check.
      const onUnmute = () => {
        if (monitor.graceTimer) {
          clearTimeout(monitor.graceTimer);
          monitor.graceTimer = null;
        }
      };

      // â”€â”€ "ended" event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Hardware fully disconnected or browser permission permanently revoked.
      // No grace period â€” this is always a genuine violation.
      const onEnded = () => {
        if (!isActiveRef.current || !mountedRef.current) return;
        // Cancel any pending mute grace timer â€” ended supersedes it
        if (monitor.graceTimer) {
          clearTimeout(monitor.graceTimer);
          monitor.graceTimer = null;
        }
        fire(monitor, "ended");
      };

      track.addEventListener("mute",   onMute);
      track.addEventListener("unmute", onUnmute);
      track.addEventListener("ended",  onEnded);

      // Store cleanup function on the monitor object for teardown
      (monitor as any)._cleanup = () => {
        track.removeEventListener("mute",   onMute);
        track.removeEventListener("unmute", onUnmute);
        track.removeEventListener("ended",  onEnded);
        if (monitor.graceTimer) {
          clearTimeout(monitor.graceTimer);
          monitor.graceTimer = null;
        }
      };

      if (process.env.NODE_ENV !== "production") {
        console.debug(
          `[HardwareHeartbeat] Monitoring ${kind} track: readyState=${track.readyState} muted=${track.muted}`
        );
      }
    },
    [fire]
  );

  // â”€â”€ Polling fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Some browsers don't reliably fire unmute when permissions are re-granted.
  // We poll every POLL_INTERVAL_MS and re-check actual track state.
  const startPolling = useCallback(() => {
    pollTimerRef.current = setInterval(() => {
      if (!isActiveRef.current || !mountedRef.current) return;
      for (const monitor of monitorsRef.current) {
        const { track } = monitor;
        if (track.readyState === "ended") {
          fire(monitor, "ended");
        } else if (track.muted && !monitor.graceTimer) {
          // Track is muted but no grace timer running â€” start one
          monitor.graceTimer = setTimeout(() => {
            monitor.graceTimer = null;
            if (track.muted && track.readyState === "live") {
              fire(monitor, "muted");
            }
          }, MUTE_GRACE_MS);
        }
      }
    }, POLL_INTERVAL_MS);
  }, [fire]);

  // â”€â”€ Bootstrap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!isActive) return;

    mountedRef.current = true;
    let cancelled = false;

    const bootstrap = async () => {
      try {
        // Request the smallest possible stream â€” just enough for track monitoring.
        // We request BOTH video+audio in one call so the browser only shows
        // one permission prompt (if needed at all â€” usually already granted).
        //
        // width/height 1Ã—1 and sampleRate 8000 minimise CPU overhead.
        // echoCancellation:false keeps audio raw (mirrors AudioProctoring).
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1, height: 1, frameRate: 1 },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl:  false,
            sampleRate: 8_000,
            channelCount: 1,
          },
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        // Attach monitors to both tracks
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        if (videoTrack) attachMonitor(videoTrack, "video");
        if (audioTrack) attachMonitor(audioTrack, "audio");

        // Start polling fallback
        startPolling();

      } catch (err) {
        // If getUserMedia fails (permission denied, no device), fail silently.
        // HardwareCheck already blocks users without devices, so this only
        // happens if permissions are revoked AFTER the interview started â€”
        // which ironically IS a violation. Log it but don't re-throw.
        if (!cancelled && process.env.NODE_ENV !== "production") {
          console.warn("[HardwareHeartbeat] Could not open monitor stream:", err);
        }
        if (!cancelled && isActiveRef.current) {
          // If we can't even open a stream, that itself means the device was
          // revoked after the interview started â€” flag both tracks immediately.
          onViolation(
            "camera_disabled",
            "Camera access could not be established after interview started â€” permission may have been revoked",
            "high"
          );
          onViolation(
            "microphone_disabled",
            "Microphone access could not be established after interview started â€” permission may have been revoked",
            "high"
          );
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled          = true;
      mountedRef.current = false;

      // Stop polling
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      // Detach all track listeners and clear grace timers
      for (const monitor of monitorsRef.current) {
        (monitor as any)._cleanup?.();
      }
      monitorsRef.current = [];

      // Stop the monitor stream tracks
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };

    // Re-runs only when isActive flips â€” same lifecycle as FaceProctoring
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // This component renders nothing â€” pure side-effect engine
  return null;
}

