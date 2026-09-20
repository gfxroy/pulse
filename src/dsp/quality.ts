/**
 * Signal quality / SNR scoring for fusion weights.
 * Metrics chosen to correlate with agreement vs reference devices.
 */

import type { Peak } from './peaks';
import { bpmFromPeaks } from './peaks';

/** Time-domain SNR: peak amplitude vs inter-peak noise floor (dB). */
export function timeDomainSnrDb(signal: Float32Array | number[], peaks: Peak[]): number {
  if (peaks.length < 2 || signal.length === 0) return 0;
  const peakAmps = peaks.map((p) => Math.abs(p.value));
  const meanPeak = peakAmps.reduce((a, b) => a + b, 0) / peakAmps.length;

  const noise: number[] = [];
  for (let i = 0; i < signal.length; i++) {
    let near = false;
    for (const p of peaks) {
      if (Math.abs(i - p.index) < 3) {
        near = true;
        break;
      }
    }
    if (!near) noise.push(Math.abs(signal[i]));
  }
  if (noise.length < 4) return 0;
  noise.sort((a, b) => a - b);
  const noiseFloor = noise[Math.floor(noise.length * 0.5)] || 1e-12;
  return 20 * Math.log10(meanPeak / noiseFloor);
}

/** Crest factor: peak / RMS — pulsatile signals score higher. */
export function crestFactor(signal: Float32Array | number[]): number {
  const n = signal.length;
  if (n === 0) return 0;
  let peak = 0;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(signal[i]);
    if (a > peak) peak = a;
    sq += signal[i] * signal[i];
  }
  const rms = Math.sqrt(sq / n) || 1e-12;
  return peak / rms;
}

/** Map crest factor to 0–1 quality contribution. */
export function crestToQuality(crest: number): number {
  // Noise ~1.5–2.5, good PPG ~3–6+
  if (crest <= 1.5) return 0.1;
  if (crest >= 5) return 1;
  return (crest - 1.5) / 3.5;
}

/** Map spectral SNR dB already computed into a soft crest-like score. */
export function spectralCrest(snrDb: number): number {
  return snrToQuality(snrDb, 6, 16);
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
  const { intervals, cv } = bpmFromPeaks(peaks, minBpm, maxBpm);
  if (intervals.length < 2) return 0.2;
  return Math.max(0, Math.min(1, 1 - cv / 0.25));
}

/** Peak prominence proxy: mean peak vs mean absolute signal. */
export function peakProminenceScore(
  signal: Float32Array | number[],
  peaks: Peak[],
): number {
  if (peaks.length < 2 || signal.length === 0) return 0;
  let meanAbs = 0;
  for (let i = 0; i < signal.length; i++) meanAbs += Math.abs(signal[i]);
  meanAbs /= signal.length || 1;
  const meanPeak =
    peaks.reduce((a, p) => a + Math.abs(p.value), 0) / peaks.length;
  const ratio = meanPeak / (meanAbs || 1e-12);
  return Math.max(0, Math.min(1, (ratio - 1) / 3));
}

/** Combine spectral SNR, time SNR, regularity into overall quality. */
export function combineQuality(parts: {
  spectralSnrDb?: number;
  timeSnrDb?: number;
  regularity?: number;
  agreement?: number;
  crestFactor?: number;
  spectralCrest?: number;
  prominence?: number;
}): number {
  const qualities: number[] = [];
  const weights: number[] = [];
  if (parts.spectralSnrDb !== undefined) {
    qualities.push(snrToQuality(parts.spectralSnrDb));
    weights.push(0.3);
  }
  if (parts.timeSnrDb !== undefined) {
    qualities.push(snrToQuality(parts.timeSnrDb));
    weights.push(0.22);
  }
  if (parts.regularity !== undefined) {
    qualities.push(parts.regularity);
    weights.push(0.18);
  }
  if (parts.agreement !== undefined) {
    qualities.push(parts.agreement);
    weights.push(0.15);
  }
  if (parts.crestFactor !== undefined) {
    qualities.push(crestToQuality(parts.crestFactor));
    weights.push(0.08);
  }
  if (parts.spectralCrest !== undefined) {
    qualities.push(Math.max(0, Math.min(1, parts.spectralCrest)));
    weights.push(0.07);
  }
  if (parts.prominence !== undefined) {
    qualities.push(parts.prominence);
    weights.push(0.08);
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
