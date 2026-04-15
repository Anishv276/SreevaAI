"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentState } from '@livekit/components-react';

type MediaTrackLike =
  | MediaStreamTrack
  | { kind?: string; getMediaStreamTrack?: () => MediaStreamTrack | null | undefined }
  | null
  | undefined;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveAudioTrack(audioTrack?: unknown): MediaStreamTrack | null {
  if (!audioTrack) return null;

  // Check if it's already a MediaStreamTrack
  if (audioTrack instanceof MediaStreamTrack) {
    return audioTrack;
  }

  // Handle LiveKit track objects or other wrappers
  const source = audioTrack as any;
  if (typeof source.getMediaStreamTrack === 'function') {
    const track = source.getMediaStreamTrack();
    return track instanceof MediaStreamTrack ? track : null;
  }

  // Fallback for simple objects with a 'kind' property but no method
  if (source.kind === 'audio' && source instanceof MediaStreamTrack) {
    return source;
  }

  return null;
}


function useTrackVolume(audioTrack?: unknown) {
  const [volume, setVolume] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const track = resolveAudioTrack(audioTrack);

    if (!track) {
      queueMicrotask(() => setVolume(0));
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const audioContext = new AudioContextCtor();
    const source = audioContext.createMediaStreamSource(new MediaStream([track]));
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    analyserRef.current = analyser;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    dataArrayRef.current = dataArray;

    const update = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        sum += dataArrayRef.current[i];
      }
      const avg = sum / dataArrayRef.current.length;
      const normalized = clamp(avg / 128.0, 0, 1.4);
      setVolume((prev) => (Math.abs(prev - normalized) < 0.02 ? prev : normalized));
      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      source.disconnect();
      analyser.disconnect();
      void audioContext.close();
    };
  }, [audioTrack]);

  return volume;
}

export function useAgentVisualizer(
  state: AgentState,
  audioTrack?: unknown
) {
  const volume = useTrackVolume(audioTrack);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPhase((prev) => (prev + 1) % 20000);
    }, 50);

    return () => window.clearInterval(timer);
  }, []);

  const t = phase * 0.05;

  return useMemo(() => {
    const pulseSlow = (Math.sin(t * 2.1) + 1) * 0.5;
    const pulseFast = (Math.sin(t * 4.8) + 1) * 0.5;
    const voice = clamp(volume, 0, 1.2);

    let intensity = 0.24;
    let speed = 0.7;

    switch (state) {
      case 'speaking':
        intensity = 0.42 + voice * 0.72 + pulseFast * 0.06;
        speed = 1.9 + voice * 1.3;
        break;
      case 'thinking':
      case 'connecting':
      case 'pre-connect-buffering':
        intensity = 0.42 + pulseFast * 0.23;
        speed = 2.35;
        break;
      case 'listening':
      case 'initializing':
        intensity = 0.3 + pulseSlow * 0.16;
        speed = 1.25;
        break;
      case 'failed':
        intensity = 0.26;
        speed = 0.55;
        break;
      case 'idle':
      case 'disconnected':
      default:
        intensity = 0.2 + pulseSlow * 0.08;
        speed = 0.6;
        break;
    }

    return {
      intensity: clamp(intensity, 0.12, 1.45),
      speed: clamp(speed, 0.45, 3.6),
    };
  }, [state, t, volume]);
}
