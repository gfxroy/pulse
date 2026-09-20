/**
 * Adaptive peak detection with refractory period tied to HR estimate.
 * Rejects ectopic / irregular spacings for rate estimation.
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
  /** Optional locked HR (BPM) to set refractory ≈ 0.55 × RR. */
  expectedBpm?: number | null;
}

export function detectPeaks(
  signal: Float32Array | number[],
  opts: PeakDetectOptions,
): Peak[] {
  const fs = opts.fs;
  const minBpm = opts.minBpm ?? 40;
  const maxBpm = opts.maxBpm ?? 200;
  const thresholdRatio = opts.thresholdRatio ?? 0.45;
  const adaptWindowSec = opts.adaptWindowSec ?? 1.5;

  // Refractory: at least the interval for maxBpm, and if we have an expected
  // HR lock, use ~55% of that RR so we don't double-count dicrotic notches.
  let refractorySamples = Math.max(2, Math.floor((60 / maxBpm) * fs));
  if (opts.expectedBpm != null && opts.expectedBpm > 0) {
    const rr = (60 / opts.expectedBpm) * fs;
    refractorySamples = Math.max(refractorySamples, Math.floor(rr * 0.55));
  } else {
    // Soft floor from minBpm so we don't fire on every ripple when unlocked
    const soft = Math.floor((60 / Math.max(minBpm, 40)) * fs * 0.35);
    refractorySamples = Math.max(refractorySamples, soft);
  }

  const win = Math.max(3, Math.floor(adaptWindowSec * fs));
  const peaks: Peak[] = [];
  let lastPeak = -refractorySamples;
  const n = signal.length;

  for (let i = 1; i < n - 1; i++) {
    if (i - lastPeak < refractorySamples) continue;
    const v = signal[i];
    if (v <= signal[i - 1] || v < signal[i + 1]) continue;

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

    // Tighten refractory once we have a few beats
    if (peaks.length >= 3 && opts.expectedBpm == null) {
      const recent = peaks.slice(-4);
      const intervals: number[] = [];
      for (let k = 1; k < recent.length; k++) {
        intervals.push(recent[k].timeSec - recent[k - 1].timeSec);
      }
      if (intervals.length > 0) {
        const med =
          [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
        const estBpm = 60 / med;
        if (estBpm >= minBpm && estBpm <= maxBpm) {
          refractorySamples = Math.max(
            Math.floor((60 / maxBpm) * fs),
            Math.floor(med * fs * 0.55),
          );
        }
      }
    }
  }
  return peaks;
}

/**
 * Convert peak times to BPM via median RR, rejecting ectopics
 * (intervals that deviate >35% from running median).
 */
export function bpmFromPeaks(
  peaks: Peak[],
  minBpm = 40,
  maxBpm = 200,
): {
  bpm: number | null;
  intervals: number[];
  medianInterval: number | null;
  cv: number;
} {
  if (peaks.length < 2) {
    return { bpm: null, intervals: [], medianInterval: null, cv: 1 };
  }

  const raw: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const dt = peaks[i].timeSec - peaks[i - 1].timeSec;
    const bpm = 60 / dt;
    if (bpm >= minBpm * 0.85 && bpm <= maxBpm * 1.15) raw.push(dt);
  }
  if (raw.length === 0) {
    return { bpm: null, intervals: [], medianInterval: null, cv: 1 };
  }

  const sortedRaw = [...raw].sort((a, b) => a - b);
  const roughMed = sortedRaw[Math.floor(sortedRaw.length / 2)];

  // Reject ectopic / missed-beat intervals
  const intervals = raw.filter((dt) => {
    const ratio = dt / roughMed;
    return ratio >= 0.65 && ratio <= 1.35;
  });

  if (intervals.length === 0) {
    return { bpm: null, intervals: raw, medianInterval: roughMed, cv: 1 };
  }

  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  let varSum = 0;
  for (const dt of intervals) {
    const d = dt - mean;
    varSum += d * d;
  }
  const cv = Math.sqrt(varSum / intervals.length) / (mean || 1);
  const bpm = 60 / median;

  if (bpm < minBpm || bpm > maxBpm) {
    return { bpm: null, intervals, medianInterval: median, cv };
  }
  return { bpm, intervals, medianInterval: median, cv };
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
