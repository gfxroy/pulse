/**
 * Handheld grip accel — same DSP as chest with stronger noise suppression
 * and longer averaging. Marked least precise in UI.
 */

import { BandpassFilter, normalize, movingAverage } from '../dsp/filters';
import { beatEnvelope, rmsEnvelope } from '../dsp/envelope';
import { detectPeaks, bpmFromPeaks } from '../dsp/peaks';
import { estimateHeartRate } from '../dsp/hrEstimate';
import { combineQuality, timeDomainSnrDb, regularityScore, bpmAgreement } from '../dsp/quality';
import { spectralPeak, spectralSnrDb } from '../dsp/fft';
import type { MethodResult } from '../types';
import type { LiveCallback } from './types';
import { METHOD_META } from './meta';

const FS = 50;
const DURATION = METHOD_META.handheld_accel.durationSec;

export async function runHandheldAccel(
  onLive: LiveCallback,
  signal: AbortSignal,
): Promise<MethodResult> {
  const started = Date.now();
  const samples: { t: number; v: number }[] = [];

  const onMotion = (e: DeviceMotionEvent) => {
    const t = (Date.now() - started) / 1000;
    const ax = e.accelerationIncludingGravity?.x ?? 0;
    const ay = e.accelerationIncludingGravity?.y ?? 0;
    const az = e.accelerationIncludingGravity?.z ?? 0;
    // Magnitude of high-pass-ish deviation from gravity ~9.8
    const mag = Math.sqrt(ax * ax + ay * ay + az * az);
    samples.push({ t, v: mag });
  };

  window.addEventListener('devicemotion', onMotion);
  const waveformWindow: number[] = [];
  let intervalId = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      intervalId = window.setInterval(() => {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const elapsed = (Date.now() - started) / 1000;
        if (elapsed >= DURATION) {
          resolve();
          return;
        }

        if (samples.length > 5) {
          const last = samples[samples.length - 1].v;
          const mean =
            samples.slice(-30).reduce((a, s) => a + s.v, 0) / Math.min(30, samples.length);
          waveformWindow.push(last - mean);
          if (waveformWindow.length > 100) waveformWindow.shift();
        }

        let quality = 0.1;
        let bpmLive: number | null = null;
        let status = 'Hold very still — least precise method…';

        if (samples.length > FS * 12) {
          const partial = analyze(samples);
          quality = partial.quality;
          bpmLive = partial.bpm;
          if (bpmLive) status = `Live ~${Math.round(bpmLive)} BPM (low precision)`;
        }

        onLive({
          waveform: [...waveformWindow],
          quality,
          bpmLive,
          elapsedSec: elapsed,
          status,
        });
      }, 200);
    });
  } finally {
    window.clearInterval(intervalId);
    window.removeEventListener('devicemotion', onMotion);
  }

  const durationSec = (Date.now() - started) / 1000;
  const result = analyze(samples);

  return {
    methodId: 'handheld_accel',
    bpm: result.bpm,
    quality: result.quality * 0.85, // inherent lower trust
    confidence: result.confidence * 0.8,
    durationSec,
    peakCount: result.peakCount,
    snrDb: result.snrDb,
    notes: 'Least precise method — interpret with caution',
    timestamp: Date.now(),
  };
}

function resample(series: { t: number; v: number }[], fs: number): Float32Array {
  if (series.length < 2) return new Float32Array(0);
  const t0 = series[0].t;
  const t1 = series[series.length - 1].t;
  const n = Math.max(1, Math.floor((t1 - t0) * fs));
  const out = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / fs;
    while (j < series.length - 2 && series[j + 1].t < t) j++;
    const a = series[j];
    const b = series[Math.min(j + 1, series.length - 1)];
    const span = b.t - a.t || 1e-6;
    const u = (t - a.t) / span;
    out[i] = a.v + (b.v - a.v) * Math.max(0, Math.min(1, u));
  }
  return out;
}

function analyze(samples: { t: number; v: number }[]): {
  bpm: number | null;
  quality: number;
  confidence: number;
  peakCount: number;
  snrDb: number;
} {
  const x = resample(samples, FS);
  if (x.length < FS * 8) {
    return { bpm: null, quality: 0.05, confidence: 0, peakCount: 0, snrDb: 0 };
  }

  // Stronger noise suppression: narrower band 0.8–8 Hz, heavy smoothing
  const bp = new BandpassFilter(0.8, 8, FS, true).processBuffer(x);
  const env = beatEnvelope(bp, FS, 60);
  const rms = rmsEnvelope(bp, Math.round(FS * 0.08));
  const blended = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) blended[i] = 0.7 * env[i] + 0.3 * rms[i];
  const smooth = movingAverage(blended, Math.round(FS * 0.12));
  const norm = normalize(smooth);

  // Longer averaging: require more peaks, stricter threshold
  const peaks = detectPeaks(norm, {
    fs: FS,
    minBpm: 45,
    maxBpm: 160,
    thresholdRatio: 0.5,
    adaptWindowSec: 2.5,
  });
  const { bpm: timeBpm } = bpmFromPeaks(peaks, 45, 160);
  const est = estimateHeartRate(norm, { fs: FS, fMin: 0.75, fMax: 2.7, thresholdRatio: 0.5 });
  const { peak: spec, magnitudes, freqs } = spectralPeak(norm, FS, 0.75, 2.7, 4);
  const snrDb = spec ? spectralSnrDb(magnitudes, freqs, spec.bin, 0.75, 2.7) : 0;

  let bpm = est.bpm ?? timeBpm;
  if (timeBpm != null && est.spectralBpm != null) {
    if (Math.abs(timeBpm - est.spectralBpm) <= 10) {
      bpm = 0.4 * timeBpm + 0.6 * est.spectralBpm; // lean spectral for noisy handheld
    }
  }

  const quality = combineQuality({
    spectralSnrDb: snrDb,
    timeSnrDb: timeDomainSnrDb(norm, peaks),
    regularity: regularityScore(peaks, 45, 160),
    agreement: bpmAgreement(timeBpm, est.spectralBpm, 12),
  });

  return {
    bpm: bpm != null ? Math.round(bpm * 10) / 10 : null,
    quality,
    confidence: bpm != null ? quality * 0.85 : 0,
    peakCount: peaks.length,
    snrDb,
  };
}
