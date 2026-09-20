/**
 * Robust preprocessing: detrend, Savitzky–Golay, sample-rate from timestamps.
 */

import { movingAverage } from './filters';

/** Derive sample rate from monotonic timestamps (ms or seconds). */
export function deriveSampleRate(
  timestamps: ArrayLike<number>,
  unit: 'ms' | 's' = 'ms',
): number {
  const n = timestamps.length;
  if (n < 2) return 0;
  const span = timestamps[n - 1] - timestamps[0];
  if (span <= 0) return 0;
  const seconds = unit === 'ms' ? span / 1000 : span;
  return (n - 1) / seconds;
}

/** Trimmed-mean sample rate from inter-sample intervals (rejects jitter outliers). */
export function robustSampleRate(
  timestamps: ArrayLike<number>,
  unit: 'ms' | 's' = 'ms',
): number {
  const n = timestamps.length;
  if (n < 3) return deriveSampleRate(timestamps, unit);
  const dts: number[] = [];
  for (let i = 1; i < n; i++) {
    const dt = timestamps[i] - timestamps[i - 1];
    if (dt > 0) dts.push(unit === 'ms' ? dt / 1000 : dt);
  }
  if (dts.length < 2) return 0;
  dts.sort((a, b) => a - b);
  const lo = Math.floor(dts.length * 0.1);
  const hi = Math.ceil(dts.length * 0.9);
  const slice = dts.slice(lo, Math.max(lo + 1, hi));
  const meanDt = slice.reduce((a, b) => a + b, 0) / slice.length;
  return meanDt > 0 ? 1 / meanDt : 0;
}

/** Linear detrend (least-squares fit removal). */
export function linearDetrend(signal: Float32Array | number[]): Float32Array {
  const n = signal.length;
  const out = new Float32Array(n);
  if (n < 2) {
    for (let i = 0; i < n; i++) out[i] = signal[i];
    return out;
  }
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += signal[i];
    sumXX += i * i;
    sumXY += i * signal[i];
  }
  const denom = n * sumXX - sumX * sumX || 1;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  for (let i = 0; i < n; i++) out[i] = signal[i] - (slope * i + intercept);
  return out;
}

/** High-pass via subtracting long moving average (DC / slow drift removal). */
export function highpassMa(
  signal: Float32Array | number[],
  windowSamples: number,
): Float32Array {
  const ma = movingAverage(signal, windowSamples);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) out[i] = signal[i] - ma[i];
  return out;
}

/**
 * Savitzky–Golay quadratic smooth (window must be odd, >= 5).
 * Preserves peak shape better than moving average.
 */
export function savitzkyGolay(
  signal: Float32Array | number[],
  windowSize = 7,
): Float32Array {
  const n = signal.length;
  let w = Math.max(5, Math.floor(windowSize));
  if (w % 2 === 0) w += 1;
  const half = (w - 1) >> 1;
  const out = new Float32Array(n);

  // Precompute SG quadratic coefficients for uniform spacing
  // c_i proportional to (3*m^2 - 7 - 20*j^2) style; use normal equations
  const coeffs = sgCoeffsQuadratic(w);

  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -half; j <= half; j++) {
      const idx = Math.max(0, Math.min(n - 1, i + j));
      sum += coeffs[j + half] * signal[idx];
    }
    out[i] = sum;
  }
  return out;
}

function sgCoeffsQuadratic(windowSize: number): Float64Array {
  const half = (windowSize - 1) >> 1;
  // Fit y = a0 + a1*x + a2*x^2; smoothed value is a0 at x=0
  // Using Gram polynomial closed form for quadratic SG:
  const coeffs = new Float64Array(windowSize);
  const m = half;
  for (let j = -m; j <= m; j++) {
    // Coefficient for point j (see Savitzky–Golay tables for quadratic)
    const num = 3 * m * (m + 1) - 1 - 5 * j * j;
    const den = (2 * m + 1) * (3 * m * m + 3 * m - 1);
    coeffs[j + m] = num / den;
  }
  return coeffs;
}

/** Sliding-window median of recent BPM estimates. */
export function medianBpm(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x > 0);
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Trimmed mean (drop top/bottom fraction). */
export function trimmedMean(values: number[], trimFrac = 0.2): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x > 0);
  if (v.length === 0) return null;
  if (v.length < 3) return v.reduce((a, b) => a + b, 0) / v.length;
  const s = [...v].sort((a, b) => a - b);
  const drop = Math.max(1, Math.floor(s.length * trimFrac));
  const slice = s.slice(drop, s.length - drop);
  if (slice.length === 0) return s[Math.floor(s.length / 2)];
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}
