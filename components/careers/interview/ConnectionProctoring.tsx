"use client";
import { useEffect, useRef, useCallback } from "react";
import type { RefObject } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, ConnectionQuality, DisconnectReason } from "livekit-client";
// ms after Reconnecting fires before logging -- avoids flagging a blip that self-resolves
const RECONNECTING_GRACE_MS = 2_000;
// Separate cooldowns: a permanent disconnect must always fire even right after a reconnect log
const RECONNECT_COOLDOWN_MS = 15_000;
const DISCONNECT_COOLDOWN_MS = 5_000;
// Consecutive poor readings required before logging a quality warning
const POOR_QUALITY_CONFIRM_COUNT = 3;
const QUALITY_COOLDOWN_MS = 60_000;
interface ConnectionProctoringProps {
  isActive: boolean;
  interviewStartedAt: RefObject<number | null>;
  onViolation: (
    eventType: string,
    reason: string,
    severity: "low" | "medium" | "high",
    metadata?: Record<string, unknown>,
  ) => void;
}
export function ConnectionProctoring({ isActive, interviewStartedAt, onViolation }: ConnectionProctoringProps) {
  const room = useRoomContext();
  const mountedRef             = useRef(false);
  const isActiveRef            = useRef(isActive);
  const lastReconnectFiredRef  = useRef(0);
  const lastDisconnectFiredRef = useRef(0);
  const poorCountRef           = useRef(0);
  const lastQualityFiredRef    = useRef(0);
  // Ref to cancel the reconnecting grace timer on cleanup
  const reconnectGraceRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  const elapsedMeta = useCallback((now: number) => {
    const start = interviewStartedAt.current;
    if (!start) return { label: null, seconds: null };
    const seconds = Math.floor((now - start) / 1000);
    return { label: `${Math.floor(seconds / 60)}m ${seconds % 60}s into interview`, seconds };
  }, [interviewStartedAt]);
  const buildMeta = useCallback((now: number): { reason_suffix: string; metadata: Record<string, unknown> } => {
    const { label, seconds } = elapsedMeta(now);
    if (!label) return { reason_suffix: "", metadata: {} };
    return { reason_suffix: ` (${label})`, metadata: { elapsedSeconds: seconds, elapsedLabel: label } };
  }, [elapsedMeta]);
  useEffect(() => {
    if (!isActive || !room) return;
    mountedRef.current = true;
    const onReconnecting = () => {
      if (!isActiveRef.current || !mountedRef.current) return;
      if (Date.now() - lastReconnectFiredRef.current < RECONNECT_COOLDOWN_MS) return;
      // Cancel any previously pending grace timer before starting a new one
      if (reconnectGraceRef.current) { clearTimeout(reconnectGraceRef.current); reconnectGraceRef.current = null; }
      const firedAt = Date.now();
      reconnectGraceRef.current = setTimeout(() => {
        reconnectGraceRef.current = null;
        if (!isActiveRef.current || !mountedRef.current) return;
        lastReconnectFiredRef.current = Date.now();
        const { reason_suffix, metadata } = buildMeta(firedAt);
        onViolation("connection_lost", `Internet connection dropped — attempting to reconnect${reason_suffix}`, "medium", metadata);
      }, RECONNECTING_GRACE_MS);
    };
    const onDisconnected = (reason?: DisconnectReason) => {
      if (!isActiveRef.current || !mountedRef.current) return;
      if (Date.now() - lastDisconnectFiredRef.current < DISCONNECT_COOLDOWN_MS) return;
      // Cancel pending reconnect grace -- disconnect supersedes it
      if (reconnectGraceRef.current) { clearTimeout(reconnectGraceRef.current); reconnectGraceRef.current = null; }
      const now = Date.now();
      lastDisconnectFiredRef.current = now;
      const reasonLabel = reason != null ? ` (${DisconnectReason[reason] ?? reason})` : "";
      const { reason_suffix, metadata } = buildMeta(now);
      onViolation("connection_lost", `Permanently disconnected from interview room${reasonLabel}${reason_suffix}`, "high", metadata);
    };
    const onQualityChanged = (quality: ConnectionQuality) => {
      if (!isActiveRef.current || !mountedRef.current) return;
      if (quality === ConnectionQuality.Poor) {
        poorCountRef.current += 1;
        if (poorCountRef.current >= POOR_QUALITY_CONFIRM_COUNT) {
          const now = Date.now();
          if (now - lastQualityFiredRef.current < QUALITY_COOLDOWN_MS) return;
          lastQualityFiredRef.current = now;
          poorCountRef.current = 0;
          const { reason_suffix, metadata } = buildMeta(now);
          onViolation("connection_lost", `Sustained poor network quality (${POOR_QUALITY_CONFIRM_COUNT} consecutive readings)${reason_suffix}`, "low", metadata);
        }
      } else {
        poorCountRef.current = 0;
      }
    };
    room.on(RoomEvent.Reconnecting,             onReconnecting);
    room.on(RoomEvent.Disconnected,             onDisconnected);
    room.on(RoomEvent.ConnectionQualityChanged,  onQualityChanged);
    return () => {
      mountedRef.current = false;
      if (reconnectGraceRef.current) { clearTimeout(reconnectGraceRef.current); reconnectGraceRef.current = null; }
      room.off(RoomEvent.Reconnecting,            onReconnecting);
      room.off(RoomEvent.Disconnected,            onDisconnected);
      room.off(RoomEvent.ConnectionQualityChanged, onQualityChanged);
    };
  }, [isActive, room]);
  return null;
}