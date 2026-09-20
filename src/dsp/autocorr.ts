/**
 * Autocorrelation-based heart-rate estimation.
 * Often more stable than FFT on short PPG / envelope windows.
 */

export interface AutocorrPeak {
  lagSamples: number;
  lagSec: number;
  bpm: number;
  correlation: number;
}

export interface AutocorrHrResult {
  bpm: number | null;
  confidence: number;
  peak: AutocorrPeak | null;
  candidates: AutocorrPeak[];
  /** Normalized autocorr for lags in search band (optional debug). */
  acf: Float64Array;
}

/**
 * Biased normalized autocorrelation for positive lags.
 * R[k] = sum_{i=0}^{n-k-1} x[i]*x[i+k] / (n * sigma^2), with mean removed.
 */
export function autocorrelation(signal: Float32Array | number[]): Float64Array {
  const n = signal.length;
  const out = new Float64Array(n);
  if (n < 4) return out;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= n;

  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = signal[i] - mean;
    varSum += d * d;
  }
  const denom = varSum || 1e-12;

  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    const lim = n - lag;
    for (let i = 0; i < lim; i++) {
      sum += (signal[i] - mean) * (signal[i + lag] - mean);
    }
    out[lag] = sum / denom;
  }
  return out;
}

/**
 * Estimate HR from autocorrelation peak in [fMin, fMax] Hz.
 * Harmonic rejection: if a strong peak exists near 2× a lower candidate,
 * prefer the fundamental unless the harmonic's correlation is much stronger.
 */
export function autocorrHeartRate(
  signal: Float32Array | number[],
  fs: number,
  fMin = 0.67,
  fMax = 3.0,
): AutocorrHrResult {
  const n = signal.length;
  if (n < fs * 2 || fs <= 0) {
    return { bpm: null, confidence: 0, peak: null, candidates: [], acf: new Float64Array(0) };
  }

  const acf = autocorrelation(signal);
  const minLag = Math.max(2, Math.floor(fs / fMax));
  const maxLag = Math.min(n - 2, Math.ceil(fs / fMin));

  // Find local maxima in lag band
  const candidates: AutocorrPeak[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (acf[lag] <= acf[lag - 1] || acf[lag] < acf[lag + 1]) continue;
    if (acf[lag] < 0.05) continue;
    const lagSec = lag / fs;
    candidates.push({
      lagSamples: lag,
      lagSec,
      bpm: 60 / lagSec,
      correlation: acf[lag],
    });
  }

  candidates.sort((a, b) => b.correlation - a.correlation);

  if (candidates.length === 0) {
    return { bpm: null, confidence: 0, peak: null, candidates, acf };
  }

  // Harmonic / subharmonic resolution among top candidates
  const chosen = pickAutocorrFundamental(candidates, acf, fs, fMin, fMax);
  if (!chosen) {
    return { bpm: null, confidence: 0, peak: null, candidates, acf };
  }

  // Parabolic refine lag
  const lag = chosen.lagSamples;
  let refinedLag = lag;
  if (lag > 0 && lag < acf.length - 1) {
    const a = acf[lag - 1];
    const b = acf[lag];
    const c = acf[lag + 1];
    const denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-12) {
      refinedLag = lag + (0.5 * (a - c)) / denom;
    }
  }
  const bpm = (60 * fs) / refinedLag;

  // Confidence from peak prominence vs neighbors + absolute correlation
  const prominence = autocorrProminence(acf, lag, minLag, maxLag);
  const conf = Math.max(
    0,
    Math.min(1, 0.35 * Math.min(1, chosen.correlation / 0.45) + 0.45 * prominence + 0.2),
  );

  return {
    bpm: clamp(bpm, fMin * 60, fMax * 60),
    confidence: conf,
    peak: {
      lagSamples: lag,
      lagSec: refinedLag / fs,
      bpm,
      correlation: chosen.correlation,
    },
    candidates: candidates.slice(0, 8),
    acf,
  };
}

function pickAutocorrFundamental(
  candidates: AutocorrPeak[],
  acf: Float64Array,
  fs: number,
  fMin: number,
  fMax: number,
): AutocorrPeak | null {
  if (candidates.length === 0) return null;
  const top = candidates.slice(0, Math.min(6, candidates.length));

  // Score each candidate: prefer fundamentals over harmonics
  let best: AutocorrPeak | null = null;
  let bestScore = -Infinity;

  for (const c of top) {
    let score = c.correlation;

    // Check if this looks like 2× of a lower peak (i.e. we are at harmonic)
    const fundLag = c.lagSamples * 2;
    const fundBpm = c.bpm / 2;
    if (fundBpm >= fMin * 60 && fundBpm <= fMax * 60 && fundLag < acf.length) {
      const fundCorr = localMaxNear(acf, fundLag, Math.max(2, Math.round(fs * 0.04)));
      if (fundCorr > c.correlation * 0.55) {
        // Strong fundamental exists — penalize treating harmonic as HR
        score *= 0.45;
      }
    }

    // Check half-lag (subharmonic / double-rate mistake): if half lag has
    // similar or stronger corr and is in band, prefer it (we're too slow)
    const halfLag = Math.round(c.lagSamples / 2);
    const doubleBpm = c.bpm * 2;
    if (doubleBpm >= fMin * 60 && doubleBpm <= fMax * 60 && halfLag >= 2) {
      const halfCorr = localMaxNear(acf, halfLag, Math.max(2, Math.round(fs * 0.03)));
      // Only boost half if clearly stronger — otherwise keep
      if (halfCorr > c.correlation * 1.15) {
        score *= 0.5;
      }
    }

    // Slight preference for physiologically common resting band when close
    if (c.bpm >= 55 && c.bpm <= 100) score *= 1.05;

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  // If best looks like double-rate relative to another strong candidate, flip
  if (best) {
    for (const c of top) {
      if (c === best) continue;
      const ratio = best.bpm / c.bpm;
      if (ratio > 1.85 && ratio < 2.15 && c.correlation > best.correlation * 0.7) {
        // best is ~2× c → prefer fundamental c
        return c;
      }
      if (ratio > 0.45 && ratio < 0.55 && best.correlation < c.correlation * 1.2) {
        // best is ~½ of stronger c → prefer c (avoid half-rate)
        return c;
      }
    }
  }

  return best;
}

function localMaxNear(acf: Float64Array, center: number, radius: number): number {
  let best = -Infinity;
  const lo = Math.max(1, center - radius);
  const hi = Math.min(acf.length - 2, center + radius);
  for (let i = lo; i <= hi; i++) {
    if (acf[i] > best) best = acf[i];
  }
  return best;
}

function autocorrProminence(
  acf: Float64Array,
  lag: number,
  minLag: number,
  maxLag: number,
): number {
  const peak = acf[lag];
  let floor = 0;
  let count = 0;
  for (let i = minLag; i <= maxLag; i++) {
    if (Math.abs(i - lag) <= 2) continue;
    floor += Math.max(0, acf[i]);
    count++;
  }
  const meanFloor = count ? floor / count : 0;
  const prom = peak - meanFloor;
  return Math.max(0, Math.min(1, prom / 0.4));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
