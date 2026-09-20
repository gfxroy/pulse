/**
 * Shannon energy, Hilbert, and RMS envelopes for motion / PCG beat extraction.
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
 * Analytic-signal magnitude via FFT Hilbert transform.
 * Falls back to RMS if signal is very short.
 */
export function hilbertEnvelope(signal: Float32Array | number[]): Float32Array {
  const n = signal.length;
  if (n < 8) return rmsEnvelope(signal, 3);

  // Next power of 2
  let nfft = 1;
  while (nfft < n) nfft <<= 1;

  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  for (let i = 0; i < n; i++) re[i] = signal[i];

  // Inline radix-2 FFT (same as dsp/fft)
  fftInPlace(re, im);

  // Hilbert: zero negative freqs, double positive (except DC/Nyquist)
  const half = nfft / 2;
  for (let k = 1; k < half; k++) {
    re[k] *= 2;
    im[k] *= 2;
  }
  for (let k = half + 1; k < nfft; k++) {
    re[k] = 0;
    im[k] = 0;
  }

  // Inverse FFT (conjugate, forward, conjugate)
  for (let i = 0; i < nfft; i++) im[i] = -im[i];
  fftInPlace(re, im);
  for (let i = 0; i < nfft; i++) {
    re[i] /= nfft;
    im[i] = -im[i] / nfft;
  }

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }
  return out;
}

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * wRe - im[i + k + len / 2] * wIm;
        const vIm = re[i + k + len / 2] * wIm + im[i + k + len / 2] * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
}

/**
 * Full beat-envelope pipeline: Shannon energy → smooth → optional Hilbert blend.
 */
export function beatEnvelope(
  bandpassed: Float32Array | number[],
  fs: number,
  smoothMs = 40,
  useHilbert = false,
): Float32Array {
  const se = shannonEnergy(bandpassed);
  const smoothSamples = Math.max(3, Math.round((smoothMs / 1000) * fs));
  const shannon = smoothEnvelope(se, smoothSamples);
  if (!useHilbert || bandpassed.length < 32) return shannon;

  const hilb = hilbertEnvelope(bandpassed);
  const hilbSmooth = smoothEnvelope(hilb, smoothSamples);
  const out = new Float32Array(shannon.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = 0.55 * shannon[i] + 0.45 * hilbSmooth[i];
  }
  return out;
}
