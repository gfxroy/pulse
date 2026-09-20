/**
 * Handheld grip accel — longer windows, stronger gating.
 * Prefer “no reading” over wrong reading.
 */

import { normalize, filtfiltBandpass, movingAverage } from '../dsp/filters';
import { beatEnvelope, rmsEnvelope } from '../dsp/envelope';
import { detectPeaks, bpmFromPeaks } from '../dsp/peaks';
import { estimateHeartRateSliding, HrTracker } from '../dsp/hrEstimate';
import { autocorrHeartRate } from '../dsp/autocorr';
import { combineQuality, timeDomainSnrDb, regularityScore, bpmAgreement } from '../dsp/quality';
import { spectralPeakHarmonicAware } from '../dsp/welch';
import { savitzkyGolay, linearDetrend } from '../dsp/preprocess';
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
  const tracker = new HrTracker(8);

  const onMotion = (e: DeviceMotionEvent) => {
    const t = (Date.now() - started) / 1000;
    const ax = e.accelerationIncludingGravity?.x ?? 0;
    const ay = e.accelerationIncludingGravity?.y ?? 0;
    const az = e.accelerationIncludingGravity?.z ?? 0;
    const mag = Math.sqrt(ax * ax + ay * ay + az * az);
    samples.push({ t, v: mag });
  };

  window.addEventListener('devicemotion', onMotion);
  const waveformWindow: number[] = [];
  let intervalId = 0;
  let lockedBpm: number | null = null;

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

        // Longer gate before publishing any live reading
        if (samples.length > FS * 16) {
          const partial = analyze(samples, lockedBpm);
          quality = partial.quality;
          if (partial.bpm != null && partial.confidence >= 0.35) {
            const stable = tracker.push(partial.bpm, 0.35, partial.confidence);
            bpmLive = stable;
            if (partial.confidence >= 0.5 && bpmLive != null) lockedBpm = bpmLive;
            if (bpmLive) status = `Live ~${Math.round(bpmLive)} BPM (low precision)`;
          } else {
            status = 'Signal unclear — hold steadier (prefer no reading)';
          }
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
  const result = analyze(samples, lockedBpm);

  // Stronger final gate — prefer null over wrong
  let bpm = result.bpm;
  let confidence = result.confidence * 0.75;
  let quality = result.quality * 0.85;
  if (confidence < 0.32 || result.snrDb < 5) {
    bpm = null;
    confidence = 0;
  }

  return {
    methodId: 'handheld_accel',
    bpm,
    quality,
    confidence,
    durationSec,
    peakCount: result.peakCount,
    snrDb: result.snrDb,
    notes:
      bpm == null
        ? 'No reliable handheld reading — try fingertip or chest'
        : 'Least precise method — interpret with caution',
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

function analyze(
  samples: { t: number; v: number }[],
  lockedBpm: number | null,
): {
  bpm: number | null;
  quality: number;
  confidence: number;
  peakCount: number;
  snrDb: number;
} {
  let x = resample(samples, FS);
  const settle = Math.round(FS * 3);
  if (x.length > settle) x = x.subarray(settle);
  if (x.length < FS * 10) {
    return { bpm: null, quality: 0.05, confidence: 0, peakCount: 0, snrDb: 0 };
  }

  // Narrower band, heavy envelope smoothing
  const bp = filtfiltBandpass(x, 0.75, 6, FS);
  const env = beatEnvelope(bp, FS, 70, true);
  const rms = rmsEnvelope(bp, Math.round(FS * 0.1));
  const blended = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) blended[i] = 0.65 * env[i] + 0.35 * rms[i];
  const smooth = movingAverage(blended, Math.round(FS * 0.14));
  const norm = normalize(savitzkyGolay(linearDetrend(smooth), 9));

  const peaks = detectPeaks(norm, {
    fs: FS,
    minBpm: 45,
    maxBpm: 150,
    thresholdRatio: 0.52,
    adaptWindowSec: 2.5,
    expectedBpm: lockedBpm,
  });
  const { bpm: timeBpm } = bpmFromPeaks(peaks, 45, 150);

  const est = estimateHeartRateSliding(
    norm,
    { fs: FS, fMin: 0.75, fMax: 2.5, lockedBpm, useWelch: true, thresholdRatio: 0.5 },
    12,
    3,
  );
  const ac = autocorrHeartRate(norm, FS, 0.75, 2.5);
  const harm = spectralPeakHarmonicAware(norm, FS, 0.75, 2.5, true);
  const snrDb = harm?.snrDb ?? est.snrDb;

  // Require agreement between at least two estimators
  const vals = [timeBpm, ac.bpm, harm?.bpm ?? null, est.bpm].filter(
    (v): v is number => v != null,
  );
  let bpm: number | null = null;
  if (vals.length >= 2) {
    vals.sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)];
    const agree = vals.filter((v) => Math.abs(v - med) <= 10);
    if (agree.length >= 2) {
      bpm = agree.reduce((a, b) => a + b, 0) / agree.length;
    }
  }

  const quality = combineQuality({
    spectralSnrDb: snrDb,
    timeSnrDb: timeDomainSnrDb(norm, peaks),
    regularity: regularityScore(peaks, 45, 150),
    agreement: bpmAgreement(timeBpm, ac.bpm, 12),
  });

  const confidence = bpm != null ? quality * 0.8 : 0;

  return {
    bpm: bpm != null ? Math.round(bpm * 10) / 10 : null,
    quality,
    confidence,
    peakCount: peaks.length,
    snrDb,
  };
}
