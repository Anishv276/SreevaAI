"use client";

/**
 * AudioProctoring.tsx
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Silent, background audio proctoring engine powered by the Web Audio API.
 * Runs entirely in the browser â€” no audio data is ever sent to the server.
 * Only violation *events* (type + reason + timestamp) are sent to the API.
 *
 * How it works:
 *  1. Calibration (0â€“15 s): Measures the ambient "noise floor" â€” the baseline
 *     energy level of the environment (keyboard, HVAC, room echo, etc.).
 *
 *  2. Detection: Continuously monitors two frequency bands:
 *     - Voice band (85â€“3 400 Hz): Where human speech produces most energy.
 *     - Sub-bass (< 85 Hz): Where non-speech rumble lives.
 *
 *  3. Flagging: When voice-band energy spikes ABOVE the noise floor by a
 *     significant margin AND sustains for > VOICE_GRACE_MS, it fires an
 *     `audio_flag` violation. This catches:
 *       â€¢ A second person whispering answers off-camera.
 *       â€¢ A phone call / earpiece playing someone's voice.
 *       â€¢ Two distinct voices overlapping (candidate + helper).
 *
 *  4. False-positive prevention:
 *     - CALIBRATION_MS: Waits 15 s before activating detection, so initial
 *       room noise is baked into the baseline.
 *     - VOICE_GRACE_MS: Requires sustained elevated energy (not a cough).
 *     - ENERGY_RATIO_THRESHOLD: Energy must be 2Ã— the noise floor, not just
 *       slightly higher.
 *     - COOLDOWN: Won't re-fire for 20 s after the last alert.
 *     - Confirm-frames: Requires N consecutive analysis frames above threshold
 *       before the grace timer even starts. This eliminates single-frame spikes.
 */

import { useEffect, useRef, useCallback } from "react";

// â”€â”€â”€ Audio Band Indices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The AnalyserNode FFT gives us `fftSize / 2` bins, each covering
// (sampleRate / fftSize) Hz. With fftSize=2048 @ 48kHz, each bin = 23.4 Hz.
// We pre-compute the bin ranges at runtime from the actual sample rate.

// â”€â”€â”€ Detection Thresholds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** ms to wait after activation before starting flag detection (calibration window) */
const CALIBRATION_MS = 15_000;

/** ms of sustained elevated energy required before flagging */
const VOICE_GRACE_MS = 3_000;

/** Voice-band energy must be this many times ABOVE noise floor to flag */
const ENERGY_RATIO_THRESHOLD = 2.2;

/** Number of consecutive analysis frames that must exceed threshold before
 *  the grace timer starts. Eliminates single-frame impulse noise. */
const CONFIRM_FRAMES_REQUIRED = 4;

/** How often the analysis loop runs (ms). 100ms = 10 checks/second. */
const ANALYSIS_INTERVAL_MS = 100;

/** After firing, wait this long before firing again (prevent spam) */
const COOLDOWN_MS = 20_000;

/** Human voice fundamental + first two harmonics live here (Hz) */
const VOICE_BAND_MIN_HZ = 85;
const VOICE_BAND_MAX_HZ = 3_400;

/** FFT size â€” larger = better frequency resolution, more CPU */
const FFT_SIZE = 2048;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AudioProctoringProps {
  /** Passed from the parent interview page â€” used for API call + data channel */
  applicationId: string;
  interviewToken: string;
  /** Set to true only while the interview phase is active */
  isActive: boolean;
  /** Called whenever a violation is detected; parent handles UI + API call */
  onViolation: (
    eventType: string,
    reason: string,
    severity?: "low" | "medium" | "high"
  ) => void;
}

export function AudioProctoring({
  applicationId,
  interviewToken,
  isActive,
  onViolation,
}: AudioProctoringProps) {
  // â”€â”€ Refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const mountedRef        = useRef(false);
  const isActiveRef       = useRef(isActive);
  const streamRef         = useRef<MediaStream | null>(null);
  const audioCtxRef       = useRef<AudioContext | null>(null);
  const analyserRef       = useRef<AnalyserNode | null>(null);
  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  // Calibration
  const activatedAtRef    = useRef<number | null>(null);   // timestamp when isActive flipped true
  const noiseFloorRef     = useRef<number>(0);             // calibrated ambient energy level
  const calibSamplesRef   = useRef<number[]>([]);          // raw samples collected during calibration

  // Grace / confirm-frame tracking
  const confirmCountRef   = useRef(0);                     // consecutive above-threshold frames
  const graceStartRef     = useRef<number | null>(null);   // when sustained elevation began

  // Cooldown
  const lastFiredRef      = useRef(0);

  // Keep isActive fresh inside the interval callback
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  // â”€â”€ Helpers: compute voice-band bin range from sample rate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getBandBins = useCallback((sampleRate: number): [number, number] => {
    const binHz = sampleRate / FFT_SIZE;
    const low   = Math.floor(VOICE_BAND_MIN_HZ / binHz);
    const high  = Math.ceil(VOICE_BAND_MAX_HZ  / binHz);
    return [low, high];
  }, []);

  // â”€â”€ Core: compute RMS energy of a frequency sub-band â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const bandEnergy = useCallback(
    (data: Uint8Array, lo: number, hi: number): number => {
      let sum = 0;
      const count = Math.max(1, hi - lo);
      for (let i = lo; i < hi && i < data.length; i++) {
        const v = data[i] / 255; // normalise 0â€“1
        sum += v * v;
      }
      return Math.sqrt(sum / count); // RMS
    },
    []
  );

  // â”€â”€ Cooldown helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const canFire = useCallback((): boolean => {
    return Date.now() - lastFiredRef.current > COOLDOWN_MS;
  }, []);

  const fire = useCallback(
    (reason: string) => {
      if (!canFire()) return;
      lastFiredRef.current = Date.now();
      onViolation("audio_flag", reason, "medium");
    },
    [canFire, onViolation]
  );

  // â”€â”€ Analysis tick â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const analysisTick = useCallback(() => {
    if (!mountedRef.current || !isActiveRef.current) return;

    const analyser = analyserRef.current;
    const ctx      = audioCtxRef.current;
    if (!analyser || !ctx) return;

    const now       = Date.now();
    const activatedAt = activatedAtRef.current;
    if (!activatedAt) return;

    const freqData  = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    const [lo, hi]  = getBandBins(ctx.sampleRate);
    const energy    = bandEnergy(freqData, lo, hi);

    // â”€â”€ Phase 1: Calibration (collect noise floor samples) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (now - activatedAt < CALIBRATION_MS) {
      calibSamplesRef.current.push(energy);

      // On the last calibration tick, lock in the noise floor as P75
      // (75th percentile â€” robust against brief candidate-speech during calibration)
      const expectedTicks = CALIBRATION_MS / ANALYSIS_INTERVAL_MS;
      if (calibSamplesRef.current.length >= expectedTicks * 0.9) {
        const sorted = [...calibSamplesRef.current].sort((a, b) => a - b);
        const p75Idx = Math.floor(sorted.length * 0.75);
        noiseFloorRef.current = Math.max(sorted[p75Idx] ?? 0, 0.01); // never zero

        if (process.env.NODE_ENV !== "production") {
          console.debug(
            `[AudioProctoring] Noise floor locked: ${(noiseFloorRef.current * 100).toFixed(1)}%`
          );
        }
      }
      return; // don't run detection during calibration
    }

    // â”€â”€ Phase 2: Detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const floor     = noiseFloorRef.current;
    const ratio     = floor > 0 ? energy / floor : 1;
    const elevated  = ratio >= ENERGY_RATIO_THRESHOLD;

    if (process.env.NODE_ENV !== "production") {
      console.debug(
        `[AudioProctoring] energy=${(energy * 100).toFixed(1)}% floor=${(floor * 100).toFixed(1)}% ratio=${ratio.toFixed(2)} elevated=${elevated}`
      );
    }

    if (elevated) {
      confirmCountRef.current += 1;

      // Only start the grace timer after enough consecutive frames confirm
      if (confirmCountRef.current >= CONFIRM_FRAMES_REQUIRED) {
        if (!graceStartRef.current) {
          graceStartRef.current = now;
        }

        const sustainedMs = now - graceStartRef.current;
        if (sustainedMs >= VOICE_GRACE_MS) {
          const sustainedSec = Math.round(sustainedMs / 1000);
          fire(
            `Elevated voice-band audio detected for ${sustainedSec}s â€” possible secondary voice or external audio source`
          );
          // Reset grace so it re-arms for the next event after cooldown
          graceStartRef.current = null;
          confirmCountRef.current = 0;
        }
      }
    } else {
      // Energy dropped â€” reset grace state
      confirmCountRef.current = Math.max(0, confirmCountRef.current - 1);
      if (confirmCountRef.current === 0) {
        graceStartRef.current = null;
      }
    }
  }, [getBandBins, bandEnergy, fire]);

  // â”€â”€ Bootstrap: open mic + start analysis when isActive flips true â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!isActive) return;

    mountedRef.current     = true;
    activatedAtRef.current  = Date.now();
    calibSamplesRef.current = [];
    noiseFloorRef.current   = 0;
    confirmCountRef.current = 0;
    graceStartRef.current   = null;
    lastFiredRef.current    = 0;

    let cancelled = false;

    const bootstrap = async () => {
      try {
        // Request mic access (audio-only, low quality is fine for analysis)
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false, // We WANT raw audio â€” echo cancellation would
            noiseSuppression: false, //   remove exactly the secondary voice we're
            autoGainControl:  false, //   trying to detect.
            channelCount: 1,
          },
          video: false,
        });

        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        // Build AudioContext graph: mic â†’ analyser (no destination = silent)
        const ctx = new AudioContext();
        if (cancelled) { await ctx.close(); stream.getTracks().forEach(t => t.stop()); return; }
        audioCtxRef.current = ctx;

        const analyser        = ctx.createAnalyser();
        analyser.fftSize      = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.6; // light smoothing â€” keep transients visible
        analyserRef.current   = analyser;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        // Note: analyser is NOT connected to ctx.destination â†’ no audio playback

        // Start the analysis loop
        intervalRef.current = setInterval(analysisTick, ANALYSIS_INTERVAL_MS);

      } catch (err) {
        // Silently fail â€” proctoring is best-effort
        if (process.env.NODE_ENV !== "production") {
          console.warn("[AudioProctoring] bootstrap error:", err);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled          = true;
      mountedRef.current = false;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;

      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    };

    // Only re-run when isActive flips â€” same pattern as FaceProctoring
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // This component renders nothing â€” it's a pure side-effect engine
  return null;
}

