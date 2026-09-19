/**
 * Reconcile time-domain peak BPM with spectral peak BPM.
 */

import { spectralPeak, spectralSnrDb } from './fft';
import { detectPeaks, bpmFromPeaks, type Peak } from './peaks';
import { combineQuality, bpmAgreement, timeDomainSnrDb } from './quality';

export interface HrEstimateOptions {
  fs: number;
  fMin?: number; // Hz, default 0.7 (~42 BPM)
  fMax?: number; // Hz, default 3.5 (~210 BPM)
  minBpm?: number;
  maxBpm?: number;
  padFactor?: number;
  thresholdRatio?: number;
}

export interface HrEstimate {
  bpm: number | null;
  quality: number;
  confidence: number;
  snrDb: number;
  timeBpm: number | null;
  spectralBpm: number | null;
  peaks: Peak[];
  peakCount: number;
}

export function estimateHeartRate(
  signal: Float32Array | number[],
  opts: HrEstimateOptions,
): HrEstimate {
  const fs = opts.fs;
  const fMin = opts.fMin ?? 0.7;
  const fMax = opts.fMax ?? 3.5;
  const minBpm = opts.minBpm ?? Math.round(fMin * 60);
  const maxBpm = opts.maxBpm ?? Math.round(fMax * 60);

  const peaks = detectPeaks(signal, {
    fs,
    minBpm,
    maxBpm,
    thresholdRatio: opts.thresholdRatio ?? 0.4,
  });
  const { bpm: timeBpm } = bpmFromPeaks(peaks, minBpm, maxBpm);

  const { peak: specPeak, magnitudes, freqs } = spectralPeak(
    signal,
    fs,
    fMin,
    fMax,
    opts.padFactor ?? 4,
  );
  const spectralBpm = specPeak ? clampBpm(specPeak.bpm, minBpm, maxBpm) : null;
  const snrDb =
    specPeak != null
      ? spectralSnrDb(magnitudes, freqs, specPeak.bin, fMin, fMax)
      : 0;
  const tSnr = timeDomainSnrDb(signal, peaks);
  const agreement = bpmAgreement(timeBpm, spectralBpm, 10);

  // Reconcile: prefer agreement; weight spectral more when SNR high
  let bpm: number | null = null;
  if (timeBpm != null && spectralBpm != null) {
    if (Math.abs(timeBpm - spectralBpm) <= 6) {
      // Weighted blend toward spectral when SNR is strong
      const wSpec = Math.min(0.7, 0.4 + snrDb / 40);
      bpm = spectralBpm * wSpec + timeBpm * (1 - wSpec);
    } else if (snrDb >= 10 && agreement < 0.4) {
      // Trust spectrum if clear peak but peaks noisy
      bpm = spectralBpm;
    } else if (peaks.length >= 4) {
      bpm = timeBpm;
    } else {
      bpm = spectralBpm;
    }
  } else {
    bpm = spectralBpm ?? timeBpm;
  }

  if (bpm != null) bpm = clampBpm(bpm, minBpm, maxBpm);

  const quality = combineQuality({
    spectralSnrDb: snrDb,
    timeSnrDb: tSnr,
    regularity: peaks.length >= 3 ? undefined : 0.3,
    agreement,
  });

  // Boost quality when both domains agree and we have enough peaks
  let conf = quality;
  if (agreement > 0.7 && peaks.length >= 3) conf = Math.min(1, conf + 0.1);
  if (bpm == null) conf = 0;

  return {
    bpm: bpm != null ? Math.round(bpm * 10) / 10 : null,
    quality,
    confidence: conf,
    snrDb,
    timeBpm,
    spectralBpm,
    peaks,
    peakCount: peaks.length,
  };
}

function clampBpm(bpm: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, bpm));
}
