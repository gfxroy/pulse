/**
 * Dual-domain HR estimation: autocorrelation + spectral (Welch/FFT) + peaks.
 * Reconciles estimates, applies harmonic rejection, sliding-window stability.
 */

import { spectralPeak, spectralSnrDb } from './fft';
import { spectralPeakHarmonicAware } from './welch';
import { autocorrHeartRate } from './autocorr';
import { detectPeaks, bpmFromPeaks, type Peak } from './peaks';
import {
  combineQuality,
  bpmAgreement,
  timeDomainSnrDb,
  crestFactor,
  spectralCrest,
} from './quality';
import { medianBpm, trimmedMean } from './preprocess';

export interface HrEstimateOptions {
  fs: number;
  fMin?: number; // Hz, default 0.67 (~40 BPM)
  fMax?: number; // Hz, default 3.0 (~180 BPM)
  minBpm?: number;
  maxBpm?: number;
  padFactor?: number;
  thresholdRatio?: number;
  /** Last confident BPM for adaptive refractory / soft prior. */
  lockedBpm?: number | null;
  /** Prefer Welch when signal long enough. Default true. */
  useWelch?: boolean;
}

export interface HrEstimate {
  bpm: number | null;
  quality: number;
  confidence: number;
  snrDb: number;
  timeBpm: number | null;
  spectralBpm: number | null;
  autocorrBpm: number | null;
  peaks: Peak[];
  peakCount: number;
  /** True when autocorr and spectral disagree by >8 BPM. */
  discordant: boolean;
}

/** Running buffer for median/trimmed-mean stabilization across windows. */
export class HrTracker {
  private recent: number[] = [];
  private maxKeep: number;

  constructor(maxKeep = 7) {
    this.maxKeep = maxKeep;
  }

  push(bpm: number | null, minConfidence = 0.25, confidence = 1): number | null {
    if (bpm == null || !Number.isFinite(bpm) || confidence < minConfidence) {
      return this.stable();
    }
    this.recent.push(bpm);
    if (this.recent.length > this.maxKeep) this.recent.shift();
    return this.stable();
  }

  stable(): number | null {
    if (this.recent.length === 0) return null;
    if (this.recent.length < 3) return medianBpm(this.recent);
    return trimmedMean(this.recent, 0.15) ?? medianBpm(this.recent);
  }

  lastConfident(): number | null {
    return this.recent.length ? this.recent[this.recent.length - 1] : null;
  }

  reset(): void {
    this.recent = [];
  }
}

export function estimateHeartRate(
  signal: Float32Array | number[],
  opts: HrEstimateOptions,
): HrEstimate {
  const fs = opts.fs;
  const fMin = opts.fMin ?? 0.67;
  const fMax = opts.fMax ?? 3.0;
  const minBpm = opts.minBpm ?? Math.round(fMin * 60);
  const maxBpm = opts.maxBpm ?? Math.round(fMax * 60);
  const locked = opts.lockedBpm ?? null;

  const empty: HrEstimate = {
    bpm: null,
    quality: 0,
    confidence: 0,
    snrDb: 0,
    timeBpm: null,
    spectralBpm: null,
    autocorrBpm: null,
    peaks: [],
    peakCount: 0,
    discordant: false,
  };

  if (!fs || fs < 5 || signal.length < fs * 2) return empty;

  // --- Time-domain peaks ---
  const peaks = detectPeaks(signal, {
    fs,
    minBpm,
    maxBpm,
    thresholdRatio: opts.thresholdRatio ?? 0.4,
    expectedBpm: locked,
  });
  const peakStats = bpmFromPeaks(peaks, minBpm, maxBpm);
  const timeBpm = peakStats.bpm != null ? clampBpm(peakStats.bpm, minBpm, maxBpm) : null;

  // --- Autocorrelation (primary peer) ---
  const ac = autocorrHeartRate(signal, fs, fMin, fMax);
  let autocorrBpm =
    ac.bpm != null ? clampBpm(ac.bpm, minBpm, maxBpm) : null;

  // Soft pull toward locked BPM if autocorr has a near candidate
  if (locked != null && ac.candidates.length > 0) {
    const near = ac.candidates.find((c) => Math.abs(c.bpm - locked) <= 12);
    if (near && autocorrBpm != null && Math.abs(autocorrBpm - locked) > 10) {
      if (near.correlation > (ac.peak?.correlation ?? 0) * 0.75) {
        autocorrBpm = clampBpm(near.bpm, minBpm, maxBpm);
      }
    }
  }

  // --- Spectral with harmonic rejection ---
  let spectralBpm: number | null = null;
  let snrDb = 0;

  if (opts.useWelch !== false) {
    const harm = spectralPeakHarmonicAware(signal, fs, fMin, fMax, true);
    if (harm) {
      spectralBpm = clampBpm(harm.bpm, minBpm, maxBpm);
      snrDb = harm.snrDb;
    }
  }

  if (spectralBpm == null) {
    const { peak: specPeak, magnitudes, freqs } = spectralPeak(
      signal,
      fs,
      fMin,
      fMax,
      opts.padFactor ?? 4,
    );
    if (specPeak) {
      spectralBpm = clampBpm(resolveSpectralHarmonic(specPeak.bpm, magnitudes, freqs, fMin, fMax), minBpm, maxBpm);
      snrDb = spectralSnrDb(magnitudes, freqs, specPeak.bin, fMin, fMax);
    }
  }

  const tSnr = timeDomainSnrDb(signal, peaks);
  const agreeAcSpec = bpmAgreement(autocorrBpm, spectralBpm, 8);
  const agreeTimeSpec = bpmAgreement(timeBpm, spectralBpm, 8);
  const agreeAcTime = bpmAgreement(autocorrBpm, timeBpm, 8);
  const agreement = Math.max(agreeAcSpec, agreeTimeSpec * 0.9, agreeAcTime * 0.9);

  // --- Reconcile ---
  const estimates: { bpm: number; w: number }[] = [];

  if (autocorrBpm != null) {
    let w = 1.0 * (0.4 + 0.6 * ac.confidence);
    if (locked != null && Math.abs(autocorrBpm - locked) <= 8) w *= 1.2;
    estimates.push({ bpm: autocorrBpm, w });
  }
  if (spectralBpm != null) {
    let w = 0.95 * (0.35 + 0.65 * Math.min(1, snrDb / 14));
    if (locked != null && Math.abs(spectralBpm - locked) <= 8) w *= 1.15;
    estimates.push({ bpm: spectralBpm, w });
  }
  if (timeBpm != null && peaks.length >= 3) {
    let w = 0.75 * (0.3 + 0.7 * Math.max(0, 1 - peakStats.cv / 0.3));
    if (locked != null && Math.abs(timeBpm - locked) <= 8) w *= 1.1;
    estimates.push({ bpm: timeBpm, w });
  }

  let bpm: number | null = null;
  let discordant = false;

  if (estimates.length === 0) {
    bpm = null;
  } else if (estimates.length === 1) {
    bpm = estimates[0].bpm;
  } else {
    // Check pairwise disagreement
    const bpms = estimates.map((e) => e.bpm);
    const maxDiff = Math.max(...bpms) - Math.min(...bpms);
    discordant = maxDiff > 8;

    if (discordant) {
      // Prefer highest-weight estimate; if autocorr & spectral differ >8, lower conf later
      estimates.sort((a, b) => b.w - a.w);
      // If top two are within 8 of a cluster, average the cluster
      const primary = estimates[0];
      const cluster = estimates.filter((e) => Math.abs(e.bpm - primary.bpm) <= 8);
      if (cluster.length >= 2) {
        const wSum = cluster.reduce((a, e) => a + e.w, 0);
        bpm = cluster.reduce((a, e) => a + e.bpm * e.w, 0) / wSum;
      } else {
        bpm = primary.bpm;
      }
    } else {
      const wSum = estimates.reduce((a, e) => a + e.w, 0) || 1;
      bpm = estimates.reduce((a, e) => a + e.bpm * e.w, 0) / wSum;
    }
  }

  // Half/double sanity vs locked or median of peers
  if (bpm != null) {
    const ref = locked ?? medianBpm(estimates.map((e) => e.bpm));
    if (ref != null) {
      if (Math.abs(bpm * 2 - ref) < Math.abs(bpm - ref) && bpm * 2 <= maxBpm) {
        // bpm looks like half-rate of reference
        const doubleOk = estimates.some((e) => Math.abs(e.bpm - ref) <= 10);
        if (doubleOk || Math.abs(bpm * 2 - ref) <= 8) bpm = bpm * 2;
      } else if (Math.abs(bpm / 2 - ref) < Math.abs(bpm - ref) && bpm / 2 >= minBpm) {
        const halfOk = estimates.some((e) => Math.abs(e.bpm - ref) <= 10);
        if (halfOk || Math.abs(bpm / 2 - ref) <= 8) bpm = bpm / 2;
      }
    }
  }

  if (bpm != null) bpm = clampBpm(bpm, minBpm, maxBpm);

  const crest = crestFactor(signal);
  const sCrest = spectralCrest(
    // cheap: use time SNR proxy when we lack full spectrum here
    snrDb,
  );

  const quality = combineQuality({
    spectralSnrDb: snrDb,
    timeSnrDb: tSnr,
    regularity: peaks.length >= 3 ? Math.max(0, 1 - peakStats.cv / 0.25) : 0.25,
    agreement,
    crestFactor: crest,
    spectralCrest: sCrest,
  });

  let conf = quality;
  if (agreement > 0.7 && (peaks.length >= 3 || (ac.confidence > 0.5 && snrDb > 6))) {
    conf = Math.min(1, conf + 0.12);
  }
  if (discordant) conf *= 0.65;
  if (autocorrBpm != null && spectralBpm != null && Math.abs(autocorrBpm - spectralBpm) > 8) {
    conf *= 0.75;
  }
  // Reject low-SNR estimates
  if (snrDb < 3 && ac.confidence < 0.35 && peaks.length < 4) {
    conf *= 0.4;
    if (conf < 0.2) bpm = null;
  }
  if (bpm == null) conf = 0;

  return {
    bpm: bpm != null ? Math.round(bpm * 10) / 10 : null,
    quality,
    confidence: conf,
    snrDb,
    timeBpm,
    spectralBpm,
    autocorrBpm,
    peaks,
    peakCount: peaks.length,
    discordant,
  };
}

/**
 * Estimate HR on overlapping windows and return median/trimmed-mean.
 */
export function estimateHeartRateSliding(
  signal: Float32Array | number[],
  opts: HrEstimateOptions,
  windowSec = 8,
  hopSec = 2,
): HrEstimate {
  const fs = opts.fs;
  const n = signal.length;
  const win = Math.round(windowSec * fs);
  const hop = Math.round(hopSec * fs);
  if (n < win || win < fs * 3) {
    return estimateHeartRate(signal, opts);
  }

  const tracker = new HrTracker(9);
  let last: HrEstimate | null = null;
  let locked = opts.lockedBpm ?? null;

  for (let start = 0; start + win <= n; start += hop) {
    const slice = signal instanceof Float32Array
      ? signal.subarray(start, start + win)
      : signal.slice(start, start + win);
    const est = estimateHeartRate(slice, { ...opts, lockedBpm: locked });
    last = est;
    if (est.bpm != null && est.confidence >= 0.3) {
      tracker.push(est.bpm, 0.3, est.confidence);
      if (est.confidence >= 0.55) locked = est.bpm;
    }
  }

  const stable = tracker.stable();
  if (!last) return estimateHeartRate(signal, opts);

  // Final full-signal estimate blended with sliding stable
  const full = estimateHeartRate(signal, { ...opts, lockedBpm: locked });
  if (stable != null && full.bpm != null) {
    if (Math.abs(stable - full.bpm) <= 10) {
      full.bpm = Math.round(((stable * 0.55 + full.bpm * 0.45) * 10)) / 10;
    } else if (full.confidence < 0.45) {
      full.bpm = Math.round(stable * 10) / 10;
      full.confidence *= 0.9;
    }
  } else if (stable != null && full.bpm == null) {
    full.bpm = Math.round(stable * 10) / 10;
    full.confidence = Math.min(0.5, full.confidence + 0.2);
  }
  return full;
}

/** Legacy FFT peak: prefer f over 2f when both bins strong. */
function resolveSpectralHarmonic(
  bpm: number,
  magnitudes: Float64Array,
  freqs: Float64Array,
  fMin: number,
  fMax: number,
): number {
  const f = bpm / 60;
  const half = f / 2;
  if (half < fMin) return bpm;

  const powerAt = (hz: number): number => {
    let best = 0;
    const tol = 0.08;
    for (let k = 0; k < freqs.length; k++) {
      if (Math.abs(freqs[k] - hz) <= tol) {
        const p = magnitudes[k] * magnitudes[k];
        if (p > best) best = p;
      }
    }
    return best;
  };

  const pFund = powerAt(half);
  const pHarm = powerAt(f);
  if (pFund > pHarm * 0.55 && half >= fMin && half <= fMax) {
    return half * 60;
  }
  return bpm;
}

function clampBpm(bpm: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, bpm));
}
