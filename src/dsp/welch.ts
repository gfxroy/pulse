/**
 * Welch's method PSD estimate + harmonic-aware spectral peak picking.
 */

import { fft } from './fft';

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export interface WelchResult {
  freqs: Float64Array;
  psd: Float64Array; // power spectral density (linear)
}

/**
 * Welch PSD with Hann windows, 50% overlap, zero-padded segments.
 */
export function welchPsd(
  signal: Float32Array | number[],
  fs: number,
  segmentSec = 4,
  overlap = 0.5,
): WelchResult {
  const n = signal.length;
  if (n < 16 || fs <= 0) {
    return { freqs: new Float64Array(0), psd: new Float64Array(0) };
  }

  let segLen = Math.max(16, Math.round(segmentSec * fs));
  if (segLen > n) segLen = n;
  const nfft = nextPow2(segLen * 2); // zero-pad for finer bins
  const hop = Math.max(1, Math.floor(segLen * (1 - overlap)));
  const half = nfft / 2;

  const accum = new Float64Array(half);
  let nSeg = 0;
  const window = new Float64Array(segLen);
  let winPower = 0;
  for (let i = 0; i < segLen; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (segLen - 1 || 1)));
    winPower += window[i] * window[i];
  }

  for (let start = 0; start + segLen <= n; start += hop) {
    const re = new Float64Array(nfft);
    const im = new Float64Array(nfft);
    let mean = 0;
    for (let i = 0; i < segLen; i++) mean += signal[start + i];
    mean /= segLen;
    for (let i = 0; i < segLen; i++) {
      re[i] = (signal[start + i] - mean) * window[i];
    }
    fft(re, im);
    for (let k = 0; k < half; k++) {
      accum[k] += re[k] * re[k] + im[k] * im[k];
    }
    nSeg++;
    if (nSeg >= 32) break; // cap compute
  }

  // Fallback: single zero-padded FFT of whole signal
  if (nSeg === 0) {
    const re = new Float64Array(nfft);
    const im = new Float64Array(nfft);
    let mean = 0;
    for (let i = 0; i < n; i++) mean += signal[i];
    mean /= n;
    const use = Math.min(n, segLen);
    for (let i = 0; i < use; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (use - 1 || 1)));
      re[i] = (signal[i] - mean) * w;
    }
    fft(re, im);
    for (let k = 0; k < half; k++) {
      accum[k] = re[k] * re[k] + im[k] * im[k];
    }
    nSeg = 1;
  }

  const scale = 1 / (nSeg * winPower * fs);
  const psd = new Float64Array(half);
  const freqs = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    freqs[k] = (k * fs) / nfft;
    // One-sided: double except DC
    const p = accum[k] * scale;
    psd[k] = k === 0 ? p : 2 * p;
  }
  return { freqs, psd };
}

export interface HarmonicSpectralPeak {
  frequencyHz: number;
  bpm: number;
  power: number;
  bin: number;
  snrDb: number;
}

/**
 * Pick HR peak in [fMin,fMax] with harmonic rejection.
 * Prefers f over 2f when both present unless 2f has much higher SNR.
 */
export function spectralPeakHarmonicAware(
  signal: Float32Array | number[],
  fs: number,
  fMin = 0.67,
  fMax = 3.0,
  preferWelch = true,
): HarmonicSpectralPeak | null {
  const n = signal.length;
  if (n < 16) return null;

  let freqs: Float64Array;
  let power: Float64Array;

  if (preferWelch && n >= fs * 6) {
    const w = welchPsd(signal, fs, Math.min(5, n / fs / 2), 0.5);
    freqs = w.freqs;
    power = w.psd;
  } else {
    // Zero-padded single FFT magnitude-squared
    const nfft = nextPow2(n * 4);
    const re = new Float64Array(nfft);
    const im = new Float64Array(nfft);
    let mean = 0;
    for (let i = 0; i < n; i++) mean += signal[i];
    mean /= n;
    for (let i = 0; i < n; i++) {
      const win = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1 || 1)));
      re[i] = (signal[i] - mean) * win;
    }
    fft(re, im);
    const half = nfft / 2;
    freqs = new Float64Array(half);
    power = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      freqs[k] = (k * fs) / nfft;
      power[k] = re[k] * re[k] + im[k] * im[k];
    }
  }

  // Collect local maxima in band
  type Cand = { bin: number; f: number; p: number };
  const cands: Cand[] = [];
  for (let k = 1; k < power.length - 1; k++) {
    const f = freqs[k];
    if (f < fMin || f > fMax) continue;
    if (power[k] >= power[k - 1] && power[k] >= power[k + 1] && power[k] > 0) {
      cands.push({ bin: k, f, p: power[k] });
    }
  }
  if (cands.length === 0) {
    // Fallback: global max in band
    let bestBin = -1;
    let bestP = -Infinity;
    for (let k = 0; k < power.length; k++) {
      if (freqs[k] >= fMin && freqs[k] <= fMax && power[k] > bestP) {
        bestP = power[k];
        bestBin = k;
      }
    }
    if (bestBin < 0) return null;
    cands.push({ bin: bestBin, f: freqs[bestBin], p: power[bestBin] });
  }

  cands.sort((a, b) => b.p - a.p);
  const top = cands.slice(0, Math.min(8, cands.length));

  // Median band power for SNR
  const bandPowers: number[] = [];
  for (let k = 0; k < power.length; k++) {
    if (freqs[k] >= fMin && freqs[k] <= fMax) bandPowers.push(power[k]);
  }
  bandPowers.sort((a, b) => a - b);
  const medianP = bandPowers[Math.floor(bandPowers.length / 2)] || 1e-24;

  const scored = top.map((c) => {
    let score = c.p;
    const snr = c.p / medianP;

    // Penalize if a strong fundamental at ~f/2 exists
    const halfF = c.f / 2;
    if (halfF >= fMin) {
      const fund = findPowerNear(freqs, power, halfF, fs);
      if (fund > c.p * 0.5) {
        score *= 0.4; // likely harmonic of fund
      }
    }

    // Boost if this looks like fundamental of a strong 2f
    const doubleF = c.f * 2;
    if (doubleF <= fMax * 1.05) {
      const harm = findPowerNear(freqs, power, doubleF, fs);
      if (harm > c.p * 0.3) {
        score *= 1.15; // consistent harmonic series
      }
    }

    // Soft prior for resting HR when SNR not decisive
    if (c.f >= 0.9 && c.f <= 1.7) score *= 1.08;

    return { ...c, score, snrDb: 10 * Math.log10(snr) };
  });

  scored.sort((a, b) => b.score - a.score);
  let chosen = scored[0];

  // Explicit half/double resolution vs runner-up
  for (const alt of scored.slice(1, 5)) {
    const ratio = chosen.f / alt.f;
    if (ratio > 1.85 && ratio < 2.15) {
      // chosen is ~2× alt → prefer fundamental unless chosen SNR much higher
      if (alt.snrDb > chosen.snrDb - 6) {
        chosen = alt;
        break;
      }
    }
    if (ratio > 0.45 && ratio < 0.55) {
      // chosen is ~½ of alt (half-rate) → prefer alt if comparable
      if (alt.snrDb >= chosen.snrDb - 3) {
        chosen = alt;
        break;
      }
    }
  }

  // Parabolic interpolate frequency
  let refinedBin = chosen.bin;
  if (chosen.bin > 0 && chosen.bin < power.length - 1) {
    const a = power[chosen.bin - 1];
    const b = power[chosen.bin];
    const c = power[chosen.bin + 1];
    const denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-18) {
      refinedBin = chosen.bin + (0.5 * (a - c)) / denom;
    }
  }
  const df = freqs.length > 1 ? freqs[1] - freqs[0] : fs / (2 * power.length);
  const frequencyHz = freqs[0] + refinedBin * df;
  // More accurate: use actual bin spacing from nfft
  const frequencyHz2 =
    chosen.bin < freqs.length - 1
      ? freqs[chosen.bin] +
        (refinedBin - chosen.bin) * (freqs[Math.min(chosen.bin + 1, freqs.length - 1)] - freqs[chosen.bin])
      : freqs[chosen.bin];

  const f = Number.isFinite(frequencyHz2) ? frequencyHz2 : frequencyHz;

  return {
    frequencyHz: f,
    bpm: f * 60,
    power: chosen.p,
    bin: chosen.bin,
    snrDb: chosen.snrDb,
  };
}

function findPowerNear(
  freqs: Float64Array,
  power: Float64Array,
  targetHz: number,
  fs: number,
): number {
  const tol = Math.max(0.05, fs / (freqs.length * 4));
  let best = 0;
  for (let k = 0; k < freqs.length; k++) {
    if (Math.abs(freqs[k] - targetHz) <= tol && power[k] > best) best = power[k];
  }
  return best;
}
