/**
 * Shannon energy and RMS envelopes for motion / PCG beat extraction.
 */

/** Shannon energy: -x² log(x²) on normalized samples — emphasizes impulsive beats. */
export function shannonEnergy(signal: Float32Array | number[]): Float32Array {
  const n = signal.length;
  let maxAbs = 1e-12;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(signal[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = signal[i] / maxAbs;
    const x2 = x * x;
    // Avoid log(0); Shannon energy peaks at |x|=1/√e
    out[i] = x2 < 1e-12 ? 0 : -x2 * Math.log(x2);
  }
  return out;
}

/** Sliding RMS envelope. */
export function rmsEnvelope(signal: Float32Array | number[], windowSamples: number): Float32Array {
  const n = signal.length;
  const w = Math.max(1, Math.floor(windowSamples));
  const out = new Float32Array(n);
  let sqSum = 0;
  for (let i = 0; i < n; i++) {
    sqSum += signal[i] * signal[i];
    if (i >= w) sqSum -= signal[i - w] * signal[i - w];
    out[i] = Math.sqrt(sqSum / Math.min(i + 1, w));
  }
  return out;
}

/** Smooth with short moving average after Shannon energy. */
export function smoothEnvelope(
  signal: Float32Array | number[],
  smoothSamples: number,
): Float32Array {
  const n = signal.length;
  const w = Math.max(1, Math.floor(smoothSamples));
  const out = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += signal[i];
    if (i >= w) sum -= signal[i - w];
    out[i] = sum / Math.min(i + 1, w);
  }
  return out;
}

/**
 * Full beat-envelope pipeline: Shannon energy → smooth → optional RMS blend.
 */
export function beatEnvelope(
  bandpassed: Float32Array | number[],
  fs: number,
  smoothMs = 40,
): Float32Array {
  const se = shannonEnergy(bandpassed);
  const smoothSamples = Math.max(3, Math.round((smoothMs / 1000) * fs));
  return smoothEnvelope(se, smoothSamples);
}
