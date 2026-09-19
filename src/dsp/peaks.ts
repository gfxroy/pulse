/**
 * Adaptive peak detection with refractory period (minimum RR interval).
 */

export interface Peak {
  index: number;
  value: number;
  timeSec: number;
}

export interface PeakDetectOptions {
  fs: number;
  /** Min BPM → refractory period. Default 40. */
  minBpm?: number;
  /** Max BPM for adaptive threshold window. Default 200. */
  maxBpm?: number;
  /** Threshold as fraction of local max (0–1). Default 0.45. */
  thresholdRatio?: number;
  /** Rolling window (sec) for adaptive amplitude. Default 1.5. */
  adaptWindowSec?: number;
}

export function detectPeaks(
  signal: Float32Array | number[],
  opts: PeakDetectOptions,
): Peak[] {
  const fs = opts.fs;
  const minBpm = opts.minBpm ?? 40;
  const thresholdRatio = opts.thresholdRatio ?? 0.45;
  const adaptWindowSec = opts.adaptWindowSec ?? 1.5;
  const refractory = Math.floor((60 / (opts.maxBpm ?? 200)) * fs); // min samples between peaks at max HR
  // Use minBpm for longer refractory floor
  const refractoryMin = Math.floor((60 / Math.max(minBpm, 40)) * fs * 0.55);
  const refractorySamples = Math.max(refractory, Math.floor(refractoryMin * 0.5));
  const win = Math.max(3, Math.floor(adaptWindowSec * fs));

  const peaks: Peak[] = [];
  let lastPeak = -refractorySamples;
  const n = signal.length;

  for (let i = 1; i < n - 1; i++) {
    if (i - lastPeak < refractorySamples) continue;
    const v = signal[i];
    if (v <= signal[i - 1] || v < signal[i + 1]) continue; // not local max

    // Local adaptive threshold from recent absolute values
    let localMax = 0;
    const start = Math.max(0, i - win);
    for (let j = start; j <= i; j++) {
      const a = Math.abs(signal[j]);
      if (a > localMax) localMax = a;
    }
    const thresh = localMax * thresholdRatio;
    if (v < thresh) continue;

    peaks.push({ index: i, value: v, timeSec: i / fs });
    lastPeak = i;
  }
  return peaks;
}

/** Convert peak times to BPM via median RR interval. */
export function bpmFromPeaks(peaks: Peak[], minBpm = 40, maxBpm = 200): {
  bpm: number | null;
  intervals: number[];
  medianInterval: number | null;
} {
  if (peaks.length < 2) {
    return { bpm: null, intervals: [], medianInterval: null };
  }
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const dt = peaks[i].timeSec - peaks[i - 1].timeSec;
    const bpm = 60 / dt;
    if (bpm >= minBpm && bpm <= maxBpm) intervals.push(dt);
  }
  if (intervals.length === 0) {
    return { bpm: null, intervals: [], medianInterval: null };
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return { bpm: 60 / median, intervals, medianInterval: median };
}

/**
 * Match two peak streams (e.g. accel vs gyro). Keep peaks that have a
 * counterpart within toleranceSec. Returns consensus peak times.
 */
export function crossValidatePeaks(
  a: Peak[],
  b: Peak[],
  toleranceSec = 0.12,
): Peak[] {
  const matched: Peak[] = [];
  const usedB = new Set<number>();
  for (const pa of a) {
    let bestJ = -1;
    let bestDt = Infinity;
    for (let j = 0; j < b.length; j++) {
      if (usedB.has(j)) continue;
      const dt = Math.abs(pa.timeSec - b[j].timeSec);
      if (dt < bestDt && dt <= toleranceSec) {
        bestDt = dt;
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      usedB.add(bestJ);
      // Average time of matched pair
      const t = (pa.timeSec + b[bestJ].timeSec) / 2;
      matched.push({
        index: pa.index,
        value: (pa.value + b[bestJ].value) / 2,
        timeSec: t,
      });
    }
  }
  return matched;
}
