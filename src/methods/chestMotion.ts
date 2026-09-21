/**
 * Chest-placed phone: bandpass accel + Hilbert/Shannon envelope,
 * parallel gyro pipeline, true coincidence window, autocorr + harmonic checks.
 */

import { normalize, filtfiltBandpass } from '../dsp/filters';
import { beatEnvelope } from '../dsp/envelope';
import { detectPeaks, bpmFromPeaks, crossValidatePeaks } from '../dsp/peaks';
import { estimateHeartRateSliding, HrTracker } from '../dsp/hrEstimate';
import { autocorrHeartRate } from '../dsp/autocorr';
import { combineQuality, timeDomainSnrDb, regularityScore, bpmAgreement } from '../dsp/quality';
import { spectralPeakHarmonicAware } from '../dsp/welch';
import { savitzkyGolay, linearDetrend, resampleSeries } from '../dsp/preprocess';
import type { MethodResult } from '../types';
import type { LiveCallback } from './types';
import { METHOD_META } from './meta';

const FS = 50;
const DURATION = METHOD_META.chest_motion.durationSec;

export async function runChestMotion(
  onLive: LiveCallback,
  signal: AbortSignal,
): Promise<MethodResult> {
  const started = performance.now();
  const accelZ: { t: number; v: number }[] = [];
  const gyroMag: { t: number; v: number }[] = [];
  const tracker = new HrTracker(6);

  const onMotion = (e: DeviceMotionEvent) => {
    const t = (performance.now() - started) / 1000;
    // Prefer linear acceleration (gravity removed). Gravity-included Z is a
    // ~9.8 DC with a tiny BCG — usable after bandpass, but noisier.
    const az = e.acceleration?.z ?? e.accelerationIncludingGravity?.z;
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
  let lockedBpm: number | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      intervalId = window.setInterval(() => {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const elapsed = (performance.now() - started) / 1000;
        if (elapsed >= DURATION) {
          resolve();
          return;
        }

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
          const partial = processMotionBuffers(accelZ, gyroMag, lockedBpm);
          if (partial.bpm != null && partial.confidence >= 0.25) {
            const stable = tracker.push(partial.bpm, 0.25, partial.confidence);
            bpmLive = stable ?? partial.bpm;
            quality = partial.quality;
            if (partial.confidence >= 0.5) lockedBpm = bpmLive;
            status = `Live ~${Math.round(bpmLive)} BPM (${partial.matchedPeaks} consensus beats)`;
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

  const durationSec = (performance.now() - started) / 1000;
  const result = processMotionBuffers(accelZ, gyroMag, lockedBpm);

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

function processMotionBuffers(
  accelZ: { t: number; v: number }[],
  gyroMag: { t: number; v: number }[],
  lockedBpm: number | null,
): {
  bpm: number | null;
  quality: number;
  confidence: number;
  matchedPeaks: number;
  snrDb: number;
  notes?: string;
} {
  let az = resampleSeries(accelZ, FS);
  let gz = resampleSeries(gyroMag, FS);
  // Discard settle / placement seconds
  const settle = Math.round(FS * 2.5);
  if (az.length > settle) az = az.subarray(settle);
  if (gz.length > settle) gz = gz.subarray(settle);
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

  // Accel: bandpass for BCG impulses then Hilbert/Shannon envelope
  const accelBp = filtfiltBandpass(az, 0.8, 18, FS);
  const accelEnv = beatEnvelope(accelBp, FS, 35, true);
  const accelNorm = normalize(savitzkyGolay(linearDetrend(accelEnv), 7));

  let gyroNorm: Float32Array | null = null;
  if (gz.length >= FS * 5) {
    const gyroBp = filtfiltBandpass(gz, 0.8, 15, FS);
    gyroNorm = normalize(savitzkyGolay(beatEnvelope(gyroBp, FS, 40, true), 7));
  }

  const accelPeaks = detectPeaks(accelNorm, {
    fs: FS,
    minBpm: 40,
    maxBpm: 180,
    thresholdRatio: 0.38,
    adaptWindowSec: 1.5,
    expectedBpm: lockedBpm,
  });

  let consensusPeaks = accelPeaks;
  let notes: string | undefined;
  let crossOk = false;

  if (gyroNorm) {
    const gyroPeaks = detectPeaks(gyroNorm, {
      fs: FS,
      minBpm: 40,
      maxBpm: 180,
      thresholdRatio: 0.38,
      adaptWindowSec: 1.5,
      expectedBpm: lockedBpm,
    });
    // Tighter coincidence window (true accel↔gyro agreement)
    const matched = crossValidatePeaks(accelPeaks, gyroPeaks, 0.1);
    if (matched.length >= 3) {
      consensusPeaks = matched;
      crossOk = true;
    } else if (accelPeaks.length >= 4) {
      notes = 'Gyro cross-check weak — using accel with reduced confidence';
      consensusPeaks = accelPeaks;
    } else {
      notes = 'Insufficient accel/gyro consensus';
    }
  }

  const { bpm: timeBpm, cv } = bpmFromPeaks(consensusPeaks, 40, 180);

  const est = estimateHeartRateSliding(
    accelNorm,
    { fs: FS, fMin: 0.67, fMax: 3.0, lockedBpm, useWelch: true },
    8,
    2,
  );

  const ac = autocorrHeartRate(accelNorm, FS, 0.67, 3.0);
  const harm = spectralPeakHarmonicAware(accelNorm, FS, 0.67, 3.0, true);
  const snrDb = harm?.snrDb ?? est.snrDb;
  const tSnr = timeDomainSnrDb(accelNorm, consensusPeaks);
  const reg = regularityScore(consensusPeaks);
  const agreement = bpmAgreement(timeBpm, est.spectralBpm ?? ac.bpm, 10);

  // Reconcile interval / autocorr / spectral with harmonic checks
  const cands: { bpm: number; w: number }[] = [];
  if (timeBpm != null && consensusPeaks.length >= 3) {
    cands.push({ bpm: timeBpm, w: crossOk ? 1.2 : 0.8 });
  }
  if (ac.bpm != null) cands.push({ bpm: ac.bpm, w: 1.0 * ac.confidence });
  if (harm) cands.push({ bpm: harm.bpm, w: 0.9 * Math.min(1, snrDb / 12) });
  if (est.bpm != null) cands.push({ bpm: est.bpm, w: 0.85 * est.confidence });

  let bpm: number | null = null;
  if (cands.length > 0) {
    // Outlier-reject among candidates
    cands.sort((a, b) => b.w - a.w);
    const primary = cands[0].bpm;
    const cluster = cands.filter((c) => Math.abs(c.bpm - primary) <= 12);
    const wSum = cluster.reduce((a, c) => a + c.w, 0) || 1;
    bpm = cluster.reduce((a, c) => a + c.bpm * c.w, 0) / wSum;
  }

  let quality = combineQuality({
    spectralSnrDb: snrDb,
    timeSnrDb: tSnr,
    regularity: reg,
    agreement,
  });

  if (crossOk && consensusPeaks.length >= 4) {
    quality = Math.min(1, quality + 0.1);
  } else if (notes?.includes('weak')) {
    quality *= 0.7;
  }

  let confidence = bpm != null ? quality : 0;
  if (cv > 0.3) confidence *= 0.7;
  if (confidence < 0.2) {
    bpm = null;
    confidence = 0;
  }

  return {
    bpm: bpm != null ? Math.round(bpm * 10) / 10 : null,
    quality,
    confidence,
    matchedPeaks: consensusPeaks.length,
    snrDb,
    notes,
  };
}
