/**
 * Radix-2 Cooley–Tukey FFT (in-place on separate real/imag arrays).
 * Used for spectral heart-rate peak finding with zero-padding.
 */

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new Error('FFT length must be power of 2');
  }
  // Bit-reversal permutation
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

export interface SpectrumPeak {
  frequencyHz: number;
  magnitude: number;
  bpm: number;
  bin: number;
}

/** Hann window + zero-pad FFT, return magnitude spectrum and best peak in [fMin, fMax]. */
export function spectralPeak(
  signal: Float32Array | number[],
  fs: number,
  fMin: number,
  fMax: number,
  padFactor = 4,
): { peak: SpectrumPeak | null; magnitudes: Float64Array; freqs: Float64Array } {
  const n = signal.length;
  if (n < 8) {
    return { peak: null, magnitudes: new Float64Array(0), freqs: new Float64Array(0) };
  }
  const nfft = nextPow2(n * padFactor);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  // Hann window
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1 || 1)));
    re[i] = signal[i] * w;
  }
  fft(re, im);
  const half = nfft / 2;
  const magnitudes = new Float64Array(half);
  const freqs = new Float64Array(half);
  let bestBin = -1;
  let bestMag = -Infinity;
  for (let k = 0; k < half; k++) {
    const f = (k * fs) / nfft;
    freqs[k] = f;
    const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    magnitudes[k] = mag;
    if (f >= fMin && f <= fMax && mag > bestMag) {
      bestMag = mag;
      bestBin = k;
    }
  }
  if (bestBin < 0) {
    return { peak: null, magnitudes, freqs };
  }
  // Parabolic interpolation around peak for sub-bin accuracy
  let refinedBin = bestBin;
  if (bestBin > 0 && bestBin < half - 1) {
    const a = magnitudes[bestBin - 1];
    const b = magnitudes[bestBin];
    const c = magnitudes[bestBin + 1];
    const denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-12) {
      refinedBin = bestBin + (0.5 * (a - c)) / denom;
    }
  }
  const frequencyHz = (refinedBin * fs) / nfft;
  return {
    peak: {
      frequencyHz,
      magnitude: bestMag,
      bpm: frequencyHz * 60,
      bin: bestBin,
    },
    magnitudes,
    freqs,
  };
}

/** Estimate SNR in dB: peak power vs median power in band. */
export function spectralSnrDb(
  magnitudes: Float64Array,
  freqs: Float64Array,
  peakBin: number,
  fMin: number,
  fMax: number,
): number {
  if (peakBin < 0 || magnitudes.length === 0) return 0;
  const peakPower = magnitudes[peakBin] * magnitudes[peakBin];
  const bandPowers: number[] = [];
  for (let k = 0; k < magnitudes.length; k++) {
    if (freqs[k] >= fMin && freqs[k] <= fMax && Math.abs(k - peakBin) > 2) {
      bandPowers.push(magnitudes[k] * magnitudes[k]);
    }
  }
  if (bandPowers.length === 0) return 0;
  bandPowers.sort((a, b) => a - b);
  const median = bandPowers[Math.floor(bandPowers.length / 2)] || 1e-12;
  return 10 * Math.log10(peakPower / median);
}
