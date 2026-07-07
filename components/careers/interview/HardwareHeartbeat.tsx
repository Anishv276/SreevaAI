"use client";
import { useEffect, useRef, useCallback } from "react";
import type { RefObject } from "react";
// ms a track must remain muted before flagging -- rules out brief OS permission re-checks
const MUTE_GRACE_MS = 4_000;
// Minimum gap between repeated violations for the same track
const COOLDOWN_MS = 30_000;
// Polling interval to catch cases where browsers don't reliably fire unmute
const POLL_INTERVAL_MS = 5_000;
interface TrackMonitor {
  track: MediaStreamTrack;
  kind: "video" | "audio";
  graceTimer: ReturnType<typeof setTimeout> | null;
  lastFired: number;
  cleanup: () => void;
}
interface HardwareHeartbeatProps {
  isActive: boolean;
  interviewStartedAt: RefObject<number | null>;
  onViolation: (
    eventType: string,
    reason: string,
    severity: "low" | "medium" | "high",
    metadata?: Record<string, unknown>,
  ) => void;
}
export function HardwareHeartbeat({
  isActive,
  interviewStartedAt,
  onViolation,
}: HardwareHeartbeatProps) {
  const mountedRef   = useRef(false);
  const isActiveRef  = useRef(isActive);
  const streamRef    = useRef<MediaStream | null>(null);
  const monitorsRef  = useRef<TrackMonitor[]>([]);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  const elapsedMeta = useCallback((now: number) => {
    const start = interviewStartedAt.current;
    if (!start) return { label: null, seconds: null };
    const seconds = Math.floor((now - start) / 1000);
    const label = `${Math.floor(seconds / 60)}m ${seconds % 60}s into interview`;
    return { label, seconds };
  }, [interviewStartedAt]);
  const fire = useCallback((monitor: TrackMonitor, cause: "muted" | "ended") => {
    const now = Date.now();
    if (now - monitor.lastFired < COOLDOWN_MS) return;
    monitor.lastFired = now;
    const label = monitor.kind === "video" ? "Camera" : "Microphone";
    const eventType = monitor.kind === "video" ? "camera_disabled" : "microphone_disabled";
    const { label: elapsedLabel, seconds: elapsedSeconds } = elapsedMeta(now);
    const baseReason = cause === "ended"
      ? `${label} disconnected or permission revoked`
      : `${label} disabled at OS/hardware level`;
    const reason = elapsedLabel ? `${baseReason} (${elapsedLabel})` : baseReason;
    const metadata: Record<string, unknown> = {};
    if (elapsedSeconds !== null) { metadata.elapsedSeconds = elapsedSeconds; metadata.elapsedLabel = elapsedLabel; }
    onViolation(eventType, reason, "high", metadata);
  }, [elapsedMeta, onViolation]);
  const attachMonitor = useCallback((track: MediaStreamTrack, kind: "video" | "audio") => {
    const monitor: TrackMonitor = { track, kind, graceTimer: null, lastFired: 0, cleanup: () => {} };
    monitorsRef.current.push(monitor);
    const onMute = () => {
      if (!isActiveRef.current || !mountedRef.current || monitor.graceTimer) return;
      monitor.graceTimer = setTimeout(() => {
        monitor.graceTimer = null;
        if (track.muted && track.readyState === "live") fire(monitor, "muted");
      }, MUTE_GRACE_MS);
    };
    const onUnmute = () => {
      if (monitor.graceTimer) { clearTimeout(monitor.graceTimer); monitor.graceTimer = null; }
    };
    const onEnded = () => {
      if (!isActiveRef.current || !mountedRef.current) return;
      if (monitor.graceTimer) { clearTimeout(monitor.graceTimer); monitor.graceTimer = null; }
      fire(monitor, "ended");
    };
    track.addEventListener("mute",   onMute);
    track.addEventListener("unmute", onUnmute);
    track.addEventListener("ended",  onEnded);
    monitor.cleanup = () => {
      track.removeEventListener("mute",   onMute);
      track.removeEventListener("unmute", onUnmute);
      track.removeEventListener("ended",  onEnded);
      if (monitor.graceTimer) { clearTimeout(monitor.graceTimer); monitor.graceTimer = null; }
    };
  }, [fire]);
  const startPolling = useCallback(() => {
    pollTimerRef.current = setInterval(() => {
      if (!isActiveRef.current || !mountedRef.current) return;
      for (const monitor of monitorsRef.current) {
        if (monitor.track.readyState === "ended") {
          fire(monitor, "ended");
        } else if (monitor.track.muted && !monitor.graceTimer) {
          monitor.graceTimer = setTimeout(() => {
            monitor.graceTimer = null;
            if (monitor.track.muted && monitor.track.readyState === "live") fire(monitor, "muted");
          }, MUTE_GRACE_MS);
        }
      }
    }, POLL_INTERVAL_MS);
  }, [fire]);
  useEffect(() => {
    if (!isActive) return;
    mountedRef.current = true;
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1, height: 1, frameRate: 1 },
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 8_000, channelCount: 1 },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        if (videoTrack) attachMonitor(videoTrack, "video");
        if (audioTrack) attachMonitor(audioTrack, "audio");
        startPolling();
      } catch {
        // getUserMedia failed after interview started -- permissions were revoked.
        // Fire once per device type rather than both at once; they're independent events.
        if (!cancelled && isActiveRef.current) {
          const now = Date.now();
          const { label: elapsedLabel, seconds: elapsedSeconds } = (() => {
            const start = interviewStartedAt.current;
            if (!start) return { label: null, seconds: null };
            const s = Math.floor((now - start) / 1000);
            return { label: `${Math.floor(s / 60)}m ${s % 60}s into interview`, seconds: s };
          })();
          const meta: Record<string, unknown> = {};
          if (elapsedSeconds !== null) { meta.elapsedSeconds = elapsedSeconds; meta.elapsedLabel = elapsedLabel; }
          const suffix = elapsedLabel ? ` (${elapsedLabel})` : "";
          onViolation("camera_disabled",    `Camera permission revoked after interview started${suffix}`, "high", meta);
          onViolation("microphone_disabled", `Microphone permission revoked after interview started${suffix}`, "high", meta);
        }
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
      for (const monitor of monitorsRef.current) monitor.cleanup();
      monitorsRef.current = [];
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [isActive]);
  return null;
}