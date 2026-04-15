"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { animate, useMotionValue, useMotionValueEvent } from 'framer-motion';
import type { AgentState } from '@livekit/components-react';

function useAnimatedValue(initialValue: number) {
  const [value, setValue] = useState(initialValue);
  const motionValue = useMotionValue(initialValue);
  
  useMotionValueEvent(motionValue, 'change', (v) => setValue(v));

  const animateTo = useCallback((target: number | number[], options: any) => {
    return animate(motionValue, target, options);
  }, [motionValue]);

  return { value, animateTo };
}

// Simple placeholder for useTrackVolume logic if not available from LiveKit directly
// but since we want to be high-performance, we'll use a simplified version.
function useTrackVolume(audioTrack?: { getMediaStreamTrack(): MediaStreamTrack | undefined }) {
  const [volume, setVolume] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const track = audioTrack?.getMediaStreamTrack();
    if (!track || track.kind !== 'audio') {
      setVolume(0);
      return;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
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
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        sum += dataArrayRef.current[i];
      }
      const avg = sum / dataArrayRef.current.length;
      setVolume(avg / 128.0); // Normalize to ~0-1
      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioContext.close();
    };
  }, [audioTrack]);

  return volume;
}

export function useAgentVisualizer(
  state: AgentState,
  audioTrack?: any
) {
  const { value: intensity, animateTo: animateIntensity } = useAnimatedValue(0.3);
  const { value: speed, animateTo: animateSpeed } = useAnimatedValue(1.0);
  const volume = useTrackVolume(audioTrack);

  useEffect(() => {
    const transition = { duration: 0.8, ease: "easeInOut" };
    const pulseTransition = { duration: 2, repeat: Infinity, repeatType: "mirror" as const, ease: "easeInOut" };

    switch (state) {
      case 'idle':
      case 'disconnected':
        animateIntensity(0.2, transition);
        animateSpeed(0.5, transition);
        break;

      case 'listening':
        // Gentle pulse when waiting
        animateIntensity([0.3, 0.5], pulseTransition);
        animateSpeed(1.2, transition);
        break;

      case 'thinking':
      case 'connecting':
        // Distinct "neural link" pulse
        animateIntensity([0.4, 0.7], { ...pulseTransition, duration: 1.2 });
        animateSpeed(2.5, transition);
        break;

      case 'speaking':
        // Reactive to volume, so we set a baseline
        animateSpeed(2.0, transition);
        break;
    }
  }, [state, animateIntensity, animateSpeed]);

  // Reactive intensity for speaking
  useEffect(() => {
    if (state === 'speaking') {
      const targetIntensity = 0.4 + (volume * 1.2);
      animateIntensity(targetIntensity, { duration: 0.1 });
    }
  }, [state, volume, animateIntensity]);

  return { intensity, speed };
}
