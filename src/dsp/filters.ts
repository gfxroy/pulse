/**
 * Cascaded biquad IIR filters (Butterworth-style).
 * Direct Form II Transposed for numerical stability.
 * Coefficients are always computed for the actual sample rate Fs.
 */

export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export interface BiquadState {
  z1: number;
  z2: number;
}

/** Second-order Butterworth low-pass at cutoff Hz. */
export function butterworthLowpass(fc: number, fs: number): BiquadCoeffs {
  const nyquist = fs / 2;
  const clipped = Math.min(fc, nyquist * 0.95);
  const w0 = (2 * Math.PI * clipped) / fs;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / Math.SQRT2; // Q = 1/√2
  const b0 = (1 - cos) / 2;
  const b1 = 1 - cos;
  const b2 = (1 - cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Second-order Butterworth high-pass at cutoff Hz. */
export function butterworthHighpass(fc: number, fs: number): BiquadCoeffs {
  const nyquist = fs / 2;
  const clipped = Math.min(Math.max(fc, 0.01), nyquist * 0.95);
  const w0 = (2 * Math.PI * clipped) / fs;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / Math.SQRT2;
  const b0 = (1 + cos) / 2;
  const b1 = -(1 + cos);
  const b2 = (1 + cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function createBiquadState(): BiquadState {
  return { z1: 0, z2: 0 };
}

export function processBiquad(x: number, c: BiquadCoeffs, s: BiquadState): number {
  const y = c.b0 * x + s.z1;
  s.z1 = c.b1 * x - c.a1 * y + s.z2;
  s.z2 = c.b2 * x - c.a2 * y;
  return y;
}

/** Cascaded high-pass then low-pass = bandpass. Order-2 each → effective order-4. */
export class BandpassFilter {
  private hp: BiquadCoeffs;
  private lp: BiquadCoeffs;
  private hpState: BiquadState;
  private lpState: BiquadState;
  private hp2: BiquadCoeffs | null = null;
  private lp2: BiquadCoeffs | null = null;
  private hp2State: BiquadState | null = null;
  private lp2State: BiquadState | null = null;
  private fs: number;
  private cascaded: boolean;
  private lowHz: number;
  private highHz: number;

  constructor(lowHz: number, highHz: number, fs: number, cascaded = true) {
    this.fs = fs;
    this.cascaded = cascaded;
    this.lowHz = lowHz;
    this.highHz = highHz;
    this.hp = butterworthHighpass(lowHz, fs);
    this.lp = butterworthLowpass(highHz, fs);
    this.hpState = createBiquadState();
    this.lpState = createBiquadState();
    if (cascaded) {
      this.hp2 = butterworthHighpass(lowHz, fs);
      this.lp2 = butterworthLowpass(highHz, fs);
      this.hp2State = createBiquadState();
      this.lp2State = createBiquadState();
    }
  }

  /** Retune cutoffs for adaptive bandpass (keeps state — expect brief transient). */
  retune(lowHz: number, highHz: number, fs?: number): void {
    if (fs != null && fs > 0) this.fs = fs;
    this.lowHz = lowHz;
    this.highHz = highHz;
    this.hp = butterworthHighpass(lowHz, this.fs);
    this.lp = butterworthLowpass(highHz, this.fs);
    if (this.cascaded) {
      this.hp2 = butterworthHighpass(lowHz, this.fs);
      this.lp2 = butterworthLowpass(highHz, this.fs);
    }
  }

  getCutoffs(): { lowHz: number; highHz: number; fs: number } {
    return { lowHz: this.lowHz, highHz: this.highHz, fs: this.fs };
  }

  process(x: number): number {
    let y = processBiquad(x, this.hp, this.hpState);
    y = processBiquad(y, this.lp, this.lpState);
    if (this.hp2 && this.lp2 && this.hp2State && this.lp2State) {
      y = processBiquad(y, this.hp2, this.hp2State);
      y = processBiquad(y, this.lp2, this.lp2State);
    }
    return y;
  }

  processBuffer(input: Float32Array | number[]): Float32Array {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = this.process(input[i]);
    return out;
  }

  reset(): void {
    this.hpState = createBiquadState();
    this.lpState = createBiquadState();
    if (this.hp2State) this.hp2State = createBiquadState();
    if (this.lp2State) this.lp2State = createBiquadState();
  }
}

/** Offline zero-phase-ish bandpass: forward-backward (filtfilt). */
export function filtfiltBandpass(
  signal: Float32Array | number[],
  lowHz: number,
  highHz: number,
  fs: number,
): Float32Array {
  const fwd = new BandpassFilter(lowHz, highHz, fs, true);
  const forward = fwd.processBuffer(signal);
  const rev = new Float32Array(forward.length);
  for (let i = 0; i < forward.length; i++) rev[i] = forward[forward.length - 1 - i];
  const bwd = new BandpassFilter(lowHz, highHz, fs, true);
  const back = bwd.processBuffer(rev);
  const out = new Float32Array(back.length);
  for (let i = 0; i < back.length; i++) out[i] = back[back.length - 1 - i];
  return out;
}

/** Adaptive bandpass centered on last confident HR (±bandwidth). */
export function adaptiveBandHz(
  lockedBpm: number | null,
  defaultLow = 0.67,
  defaultHigh = 3.5,
  halfWidthHz = 0.55,
): { low: number; high: number } {
  if (lockedBpm == null || lockedBpm < 40) {
    return { low: defaultLow, high: defaultHigh };
  }
  const f0 = lockedBpm / 60;
  return {
    low: Math.max(defaultLow, f0 - halfWidthHz),
    high: Math.min(defaultHigh, f0 + halfWidthHz),
  };
}

/** Simple moving average for detrending / smoothing. */
export function movingAverage(signal: Float32Array | number[], window: number): Float32Array {
  const n = signal.length;
  const out = new Float32Array(n);
  const w = Math.max(1, Math.floor(window));
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += signal[i];
    if (i >= w) sum -= signal[i - w];
    out[i] = sum / Math.min(i + 1, w);
  }
  return out;
}

export function detrend(signal: Float32Array | number[], window: number): Float32Array {
  const ma = movingAverage(signal, window);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) out[i] = signal[i] - ma[i];
  return out;
}

export function normalize(signal: Float32Array | number[]): Float32Array {
  const n = signal.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= Math.max(1, n);
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = signal[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / Math.max(1, n)) || 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (signal[i] - mean) / std;
  return out;
}
