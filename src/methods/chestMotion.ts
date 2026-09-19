/**
 * Chest-placed phone: bandpass accel Z + Shannon/RMS envelope,
 * parallel gyro pipeline, cross-validate beats before accepting.
 */

import { BandpassFilter, normalize } from '../dsp/filters';
import { beatEnvelope } from '../dsp/envelope';
import { detectPeaks, bpmFromPeaks, crossValidatePeaks } from '../dsp/peaks';
import { estimateHeartRate } from '../dsp/hrEstimate';
import { combineQuality, timeDomainSnrDb, regularityScore, bpmAgreement } from '../dsp/quality';
import { spectralPeak, spectralSnrDb } from '../dsp/fft';
import type { MethodResult } from '../types';
import type { LiveCallback } from './types';
import { METHOD_META } from './meta';

const FS = 50; // target resampled rate
const DURATION = METHOD_META.chest_motion.durationSec;

export async function runChestMotion(
  onLive: LiveCallback,
  signal: AbortSignal,
): Promise<MethodResult> {
  const started = Date.now();
  const accelZ: { t: number; v: number }[] = [];
  const gyroMag: { t: number; v: number }[] = [];

  const onMotion = (e: DeviceMotionEvent) => {
    const t = (Date.now() - started) / 1000;
    const az = e.accelerationIncludingGravity?.z ?? e.acceleration?.z;
    if (az != null) accelZ.push({ t, v: az });
    const gx = e.rotationRate?.alpha ?? 0;
    const gy = e.rotationRate?.beta ?? 0;
    const gz = e.rotationRate?.gamma ?? 0;
    const gMag = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (e.rotationRate) gyroMag.push({ t, v: gMag });
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

        // Live preview from recent accel
        const recent = accelZ.filter((s) => s.t > elapsed - 3);
        if (recent.length > 10) {
          const vals = recent.map((s) => s.v);
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const last = vals[vals.length - 1] - mean;
          waveformWindow.push(last);
          if (waveformWindow.length > 100) waveformWindow.shift();
        }

        let quality = Math.min(0.4, accelZ.length / (FS * DURATION));
        let bpmLive: number | null = null;
        let status =
          accelZ.length < 20
            ? 'Waiting for motion sensors… place phone on sternum'
            : 'Recording chest motion… stay still';

        if (accelZ.length > FS * 8) {
          const partial = processMotionBuffers(accelZ, gyroMag, started);
          if (partial.bpm != null) {
            bpmLive = partial.bpm;
            quality = partial.quality;
            status = `Live ~${Math.round(partial.bpm)} BPM (${partial.matchedPeaks} consensus beats)`;
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
  const result = processMotionBuffers(accelZ, gyroMag, started);

  return {
    methodId: 'chest_motion',
    bpm: result.bpm,
    quality: result.quality,
    confidence: result.confidence,
    durationSec,
    peakCount: result.matchedPeaks,
    snrDb: result.snrDb,
    notes: result.notes,
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

function processMotionBuffers(
  accelZ: { t: number; v: number }[],
  gyroMag: { t: number; v: number }[],
  _started: number,
): {
  bpm: number | null;
  quality: number;
  confidence: number;
  matchedPeaks: number;
  snrDb: number;
  notes?: string;
} {
  const az = resample(accelZ, FS);
  const gz = resample(gyroMag, FS);
  if (az.length < FS * 5) {
    return {
      bpm: null,
      quality: 0.05,
      confidence: 0,
      matchedPeaks: 0,
      snrDb: 0,
      notes: 'Insufficient motion samples',
    };
  }

  // Accel Z: bandpass 1–20 Hz (heart sounds / ballistocardiographic impulses)
  const accelBp = new BandpassFilter(1.0, 20, FS, true).processBuffer(az);
  const accelEnv = beatEnvelope(accelBp, FS, 35);
  const accelNorm = normalize(accelEnv);

  // Gyro: bandpass 1–15 Hz then envelope
  let gyroNorm: Float32Array | null = null;
  if (gz.length >= FS * 5) {
    const gyroBp = new BandpassFilter(1.0, 15, FS, true).processBuffer(gz);
    gyroNorm = normalize(beatEnvelope(gyroBp, FS, 40));
  }

  const accelPeaks = detectPeaks(accelNorm, {
    fs: FS,
    minBpm: 40,
    maxBpm: 180,
    thresholdRatio: 0.4,
    adaptWindowSec: 1.5,
  });

  let consensusPeaks = accelPeaks;
  let notes: string | undefined;

  if (gyroNorm) {
    const gyroPeaks = detectPeaks(gyroNorm, {
      fs: FS,
      minBpm: 40,
      maxBpm: 180,
      thresholdRatio: 0.4,
      adaptWindowSec: 1.5,
    });
    const matched = crossValidatePeaks(accelPeaks, gyroPeaks, 0.15);
    if (matched.length >= 3) {
      consensusPeaks = matched;
    } else if (accelPeaks.length >= 4) {
      notes = 'Gyro cross-check weak — using accel with reduced confidence';
      consensusPeaks = accelPeaks;
    } else {
      notes = 'Insufficient accel/gyro consensus';
    }
  }

  const { bpm: timeBpm } = bpmFromPeaks(consensusPeaks, 40, 180);
  const est = estimateHeartRate(accelNorm, { fs: FS, fMin: 0.7, fMax: 3.0 });
  const { peak: spec, magnitudes, freqs } = spectralPeak(accelNorm, FS, 0.7, 3.0, 4);
  const snrDb = spec ? spectralSnrDb(magnitudes, freqs, spec.bin, 0.7, 3.0) : est.snrDb;
  const tSnr = timeDomainSnrDb(accelNorm, consensusPeaks);
  const reg = regularityScore(consensusPeaks);
  const agreement = bpmAgreement(timeBpm, est.spectralBpm, 10);

  let bpm = timeBpm ?? est.bpm;
  if (timeBpm != null && est.spectralBpm != null && Math.abs(timeBpm - est.spectralBpm) <= 8) {
    bpm = 0.55 * timeBpm + 0.45 * est.spectralBpm;
  }

  let quality = combineQuality({
    spectralSnrDb: snrDb,
    timeSnrDb: tSnr,
    regularity: reg,
    agreement,
  });

  // Boost when cross-validated
  if (gyroNorm && consensusPeaks.length >= 4 && !notes?.includes('weak')) {
    quality = Math.min(1, quality + 0.08);
  } else if (notes?.includes('weak')) {
    quality *= 0.75;
  }

  const confidence = bpm != null ? quality : 0;

  return {
    bpm: bpm != null ? Math.round(bpm * 10) / 10 : null,
    quality,
    confidence,
    matchedPeaks: consensusPeaks.length,
    snrDb,
    notes,
  };
}
