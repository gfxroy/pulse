/**
 * Signal quality / SNR scoring for fusion weights.
 */

import type { Peak } from './peaks';
import { bpmFromPeaks } from './peaks';

/** Time-domain SNR: peak amplitude vs inter-peak noise floor (dB). */
export function timeDomainSnrDb(signal: Float32Array | number[], peaks: Peak[]): number {
  if (peaks.length < 2 || signal.length === 0) return 0;
  const peakAmps = peaks.map((p) => Math.abs(p.value));
  const meanPeak = peakAmps.reduce((a, b) => a + b, 0) / peakAmps.length;

  // Noise: samples far from peaks
  const peakIdx = new Set(peaks.map((p) => p.index));
  const noise: number[] = [];
  for (let i = 0; i < signal.length; i++) {
    let near = false;
    for (const p of peaks) {
      if (Math.abs(i - p.index) < 3) {
        near = true;
        break;
      }
    }
    if (!near && !peakIdx.has(i)) noise.push(Math.abs(signal[i]));
  }
  if (noise.length < 4) return 0;
  noise.sort((a, b) => a - b);
  const noiseFloor = noise[Math.floor(noise.length * 0.5)] || 1e-12;
  return 20 * Math.log10(meanPeak / noiseFloor);
}

/** Map SNR dB to quality 0–1 with soft knees. */
export function snrToQuality(snrDb: number, goodDb = 8, excellentDb = 18): number {
  if (snrDb <= 0) return Math.max(0, 0.05 + snrDb * 0.01);
  if (snrDb >= excellentDb) return 1;
  if (snrDb >= goodDb) {
    return 0.55 + (0.45 * (snrDb - goodDb)) / (excellentDb - goodDb);
  }
  return Math.max(0.05, (0.55 * snrDb) / goodDb);
}

/** RR interval regularity: lower CV → higher score. */
export function regularityScore(peaks: Peak[], minBpm = 40, maxBpm = 200): number {
  const { intervals } = bpmFromPeaks(peaks, minBpm, maxBpm);
  if (intervals.length < 2) return 0.2;
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  let varSum = 0;
  for (const dt of intervals) {
    const d = dt - mean;
    varSum += d * d;
  }
  const cv = Math.sqrt(varSum / intervals.length) / mean;
  // CV of 0 → 1, CV of 0.25 → ~0
  return Math.max(0, Math.min(1, 1 - cv / 0.25));
}

/** Combine spectral SNR, time SNR, regularity into overall quality. */
export function combineQuality(parts: {
  spectralSnrDb?: number;
  timeSnrDb?: number;
  regularity?: number;
  agreement?: number; // 0–1 time vs freq BPM agreement
}): number {
  const qualities: number[] = [];
  const weights: number[] = [];
  if (parts.spectralSnrDb !== undefined) {
    qualities.push(snrToQuality(parts.spectralSnrDb));
    weights.push(0.35);
  }
  if (parts.timeSnrDb !== undefined) {
    qualities.push(snrToQuality(parts.timeSnrDb));
    weights.push(0.3);
  }
  if (parts.regularity !== undefined) {
    qualities.push(parts.regularity);
    weights.push(0.2);
  }
  if (parts.agreement !== undefined) {
    qualities.push(parts.agreement);
    weights.push(0.15);
  }
  if (qualities.length === 0) return 0;
  let wSum = 0;
  let qSum = 0;
  for (let i = 0; i < qualities.length; i++) {
    qSum += qualities[i] * weights[i];
    wSum += weights[i];
  }
  return Math.max(0, Math.min(1, qSum / wSum));
}

/** Agreement between two BPM estimates (0–1). */
export function bpmAgreement(a: number | null, b: number | null, tolBpm = 8): number {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const diff = Math.abs(a - b);
  if (diff <= 2) return 1;
  if (diff >= tolBpm * 2) return 0;
  return Math.max(0, 1 - diff / (tolBpm * 2));
}
