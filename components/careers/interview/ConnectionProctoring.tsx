"use client";

/**
 * ConnectionProctoring.tsx
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Silent connection-stability proctoring engine using LiveKit RoomEvent listeners.
 *
 * MUST be rendered INSIDE a <LiveKitRoom> context â€” it uses useRoomContext()
 * to access the Room object directly, which is the only reliable way to
 * subscribe to connection lifecycle events.
 *
 * Events it listens to (from LiveKit's RoomEvent enum):
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *  RoomEvent.Reconnecting        â€” socket dropped, attempting to reconnect
 *  RoomEvent.Reconnected         â€” reconnection succeeded
 *  RoomEvent.Disconnected        â€” permanent disconnect (server closed room,
 *                                  token expired, or network unrecoverable)
 *  RoomEvent.ConnectionQualityChanged â€” quality changed for local participant
 *                                       (Poor â†’ flags a quality warning)
 *
 * Proctoring signals produced:
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *  connection_lost      severity: medium  (temporary drop, reconnecting)
 *  connection_restored  severity: low     (successfully reconnected)
 *  connection_lost      severity: high    (permanent disconnect)
 *
 * Why this matters for recruiters:
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *  â€¢ A genuine internet outage produces:  connection_lost â†’ connection_restored
 *    â†’ recruiter sees LOW/MEDIUM flag â€” not suspicious.
 *
 *  â€¢ A candidate who force-closes the browser to cheat produces:  connection_lost
 *    with NO restoration â€” recruiter sees an UNRESOLVED HIGH flag next to the
 *    other proctoring violations.
 *
 *  â€¢ The timestamp delta between lost/restored shows the exact outage duration,
 *    giving the recruiter the full picture.
 */

import { useEffect, useRef, useCallback } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, ConnectionQuality, DisconnectReason } from "livekit-client";

// â”€â”€â”€ Thresholds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** ms after Reconnecting fires before we log connection_lost.
 *  Prevents logging a violation for a momentary reconnect that resolves instantly. */
const RECONNECTING_GRACE_MS = 2_000;

/** Cooldown between repeated connection_lost events (prevents spam on
 *  flaky connections that oscillate rapidly). */
const LOST_COOLDOWN_MS = 15_000;

/** How many consecutive "Poor" quality readings before we log a quality flag. */
const POOR_QUALITY_CONFIRM_COUNT = 3;

/** Cooldown between repeated quality_warning events. */
const QUALITY_COOLDOWN_MS = 60_000;

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface ConnectionProctoringProps {
  /** Only monitor when the interview phase is active. */
  isActive: boolean;
  /** Called on every loggable connection event. */
  onViolation: (
    eventType: string,
    reason: string,
    severity?: "low" | "medium" | "high"
  ) => void;
}

export function ConnectionProctoring({
  isActive,
  onViolation,
}: ConnectionProctoringProps) {
  const room = useRoomContext();

  // â”€â”€ State refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const mountedRef            = useRef(false);
  const isActiveRef           = useRef(isActive);
  const reconnectingTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectStartRef    = useRef<number | null>(null);  // timestamp of last connection_lost
  const lastLostFiredRef      = useRef(0);
  const poorCountRef          = useRef(0);
  const lastQualityFiredRef   = useRef(0);

  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  // â”€â”€ Cooldown helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const canFireLost = useCallback((): boolean =>
    Date.now() - lastLostFiredRef.current > LOST_COOLDOWN_MS, []);

  const canFireQuality = useCallback((): boolean =>
    Date.now() - lastQualityFiredRef.current > QUALITY_COOLDOWN_MS, []);

  // â”€â”€ Core: attach/detach RoomEvent listeners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!isActive || !room) return;

    mountedRef.current = true;

    // â”€â”€ Handler: Reconnecting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // LiveKit fires this the moment the WebSocket drops and it starts the
    // retry loop. We delay logging by RECONNECTING_GRACE_MS to avoid
    // flagging a <2 s blip as a violation.
    const onReconnecting = () => {
      if (!isActiveRef.current || !mountedRef.current) return;
      if (!canFireLost()) return;

      // Record when the drop started (used to compute duration on restore)
      disconnectStartRef.current = Date.now();

      reconnectingTimerRef.current = setTimeout(() => {
        reconnectingTimerRef.current = null;
        // Only fire if we're STILL reconnecting (not already recovered)
        if (!isActiveRef.current || !mountedRef.current) return;
        lastLostFiredRef.current = Date.now();
        onViolation(
          "connection_lost",
          "Internet connection dropped â€” LiveKit is attempting to reconnect",
          "medium"
        );
        if (process.env.NODE_ENV !== "production") {
          console.debug("[ConnectionProctoring] connection_lost fired (reconnecting)");
        }
      }, RECONNECTING_GRACE_MS);
    };

    // â”€â”€ Handler: Reconnected â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // LiveKit fires this when the WebSocket is restored.
    const onReconnected = () => {
      if (!isActiveRef.current || !mountedRef.current) return;

      // Cancel the grace timer â€” if it hadn't fired yet, the blip was too
      // short to matter and we log NOTHING (no lost, no restored).
      if (reconnectingTimerRef.current) {
        clearTimeout(reconnectingTimerRef.current);
        reconnectingTimerRef.current = null;
        disconnectStartRef.current = null;
        if (process.env.NODE_ENV !== "production") {
          console.debug("[ConnectionProctoring] Reconnected within grace â€” no event logged");
        }
        return;
      }

      // If the lost event DID fire, compute the outage duration and log restoration
      const outageStarted = disconnectStartRef.current;
      disconnectStartRef.current = null;
      const outageSec = outageStarted
        ? Math.round((Date.now() - outageStarted) / 1000)
        : 0;

      onViolation(
        "connection_restored",
        outageSec > 0
          ? `Connection restored after ${outageSec}s outage`
          : "Connection restored successfully",
        "low"
      );
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[ConnectionProctoring] connection_restored (${outageSec}s outage)`);
      }
    };

    // â”€â”€ Handler: Disconnected (permanent) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // This fires when the Room is permanently disconnected â€” the server closed
    // the room, the token expired, or the network is completely unrecoverable.
    const onDisconnected = (reason?: DisconnectReason) => {
      if (!isActiveRef.current || !mountedRef.current) return;

      // Cancel any pending reconnecting grace timer
      if (reconnectingTimerRef.current) {
        clearTimeout(reconnectingTimerRef.current);
        reconnectingTimerRef.current = null;
      }

      const reasonLabel = reason != null
        ? ` (reason: ${DisconnectReason[reason] ?? reason})`
        : "";

      // Only fire if we haven't just fired a medium-severity lost recently
      if (canFireLost()) {
        lastLostFiredRef.current = Date.now();
        onViolation(
          "connection_lost",
          `Permanently disconnected from interview room${reasonLabel}`,
          "high"
        );
      }
      disconnectStartRef.current = null;

      if (process.env.NODE_ENV !== "production") {
        console.debug(`[ConnectionProctoring] Disconnected permanently${reasonLabel}`);
      }
    };

    // â”€â”€ Handler: ConnectionQualityChanged â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Fires when the local participant's connection quality changes.
    // We only flag "Poor" quality (value = ConnectionQuality.Poor).
    // We require POOR_QUALITY_CONFIRM_COUNT consecutive readings before logging
    // to prevent flagging a momentary spike.
    const onQualityChanged = (quality: ConnectionQuality) => {
      if (!isActiveRef.current || !mountedRef.current) return;

      if (quality === ConnectionQuality.Poor) {
        poorCountRef.current += 1;
        if (poorCountRef.current >= POOR_QUALITY_CONFIRM_COUNT && canFireQuality()) {
          lastQualityFiredRef.current = Date.now();
          poorCountRef.current = 0;
          onViolation(
            "connection_lost",
            `Sustained poor network quality detected (${POOR_QUALITY_CONFIRM_COUNT} consecutive poor readings)`,
            "low"
          );
          if (process.env.NODE_ENV !== "production") {
            console.debug("[ConnectionProctoring] Sustained poor quality flagged");
          }
        }
      } else {
        // Quality improved â€” reset the counter
        poorCountRef.current = 0;
      }
    };

    // â”€â”€ Attach listeners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    room.on(RoomEvent.Reconnecting,            onReconnecting);
    room.on(RoomEvent.Reconnected,             onReconnected);
    room.on(RoomEvent.Disconnected,            onDisconnected);
    room.on(RoomEvent.ConnectionQualityChanged, onQualityChanged);

    if (process.env.NODE_ENV !== "production") {
      console.debug("[ConnectionProctoring] Listeners attached to Room");
    }

    return () => {
      mountedRef.current = false;

      // Cancel any pending grace timer
      if (reconnectingTimerRef.current) {
        clearTimeout(reconnectingTimerRef.current);
        reconnectingTimerRef.current = null;
      }

      // Detach all listeners
      room.off(RoomEvent.Reconnecting,            onReconnecting);
      room.off(RoomEvent.Reconnected,             onReconnected);
      room.off(RoomEvent.Disconnected,            onDisconnected);
      room.off(RoomEvent.ConnectionQualityChanged, onQualityChanged);

      if (process.env.NODE_ENV !== "production") {
        console.debug("[ConnectionProctoring] Listeners detached");
      }
    };
  // Rerun whenever isActive or the room instance changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, room]);

  // This component renders nothing â€” pure side-effect engine
  return null;
}

