/**
 * Confidence-weighted fusion — NOT a flat average.
 * Weights = method quality × reliability prior.
 * Outliers that disagree with consensus are down-weighted / flagged.
 */

import type { CompositeResult, MethodId, MethodResult } from '../types';
import { METHOD_META } from '../methods/meta';

/** Reliability multipliers (finger > chest > face > mic > handheld). */
const RELIABILITY: Record<MethodId, number> = {
  fingertip_ppg: 1.0,
  chest_motion: 0.85,
  facial_rppg: 0.7,
  mic_pcg: 0.55,
  handheld_accel: 0.35,
};

export function fuseResults(
  methods: MethodResult[],
  mode: 'single' | 'composite' = 'composite',
): CompositeResult {
  const timestamp = Date.now();
  const valid = methods.filter((m) => m.bpm != null && Number.isFinite(m.bpm!) && m.bpm! > 0);

  if (valid.length === 0) {
    return {
      bpm: null,
      confidence: 0,
      methods,
      outliers: [],
      timestamp,
      mode,
    };
  }

  if (valid.length === 1 || mode === 'single') {
    const m = valid[0];
    return {
      bpm: m.bpm,
      confidence: m.confidence,
      methods,
      outliers: [],
      timestamp,
      mode,
    };
  }

  // Initial weighted estimate
  const weights = valid.map((m) => {
    const q = Math.max(0.05, m.quality);
    const conf = Math.max(0.05, m.confidence);
    return q * conf * RELIABILITY[m.methodId];
  });

  let wSum = weights.reduce((a, b) => a + b, 0) || 1;
  let bpm =
    valid.reduce((acc, m, i) => acc + (m.bpm as number) * weights[i], 0) / wSum;

  // Flag outliers: >12 BPM from consensus
  const outliers: MethodId[] = [];
  const adjustedWeights = weights.map((w, i) => {
    const diff = Math.abs((valid[i].bpm as number) - bpm);
    if (diff > 12) {
      outliers.push(valid[i].methodId);
      return w * 0.15; // heavy down-weight
    }
    if (diff > 8) return w * 0.5;
    return w;
  });

  wSum = adjustedWeights.reduce((a, b) => a + b, 0) || 1;
  bpm =
    valid.reduce((acc, m, i) => acc + (m.bpm as number) * adjustedWeights[i], 0) / wSum;

  // Confidence: agreement + mean quality + coverage of high-rank methods
  const spreads = valid.map((m) => Math.abs((m.bpm as number) - bpm));
  const meanSpread =
    spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const agreement = Math.max(0, 1 - meanSpread / 15);

  const meanQuality =
    valid.reduce((a, m) => a + m.quality, 0) / valid.length;

  const hasFinger = valid.some((m) => m.methodId === 'fingertip_ppg');
  const hasChest = valid.some((m) => m.methodId === 'chest_motion');
  const coverageBoost = (hasFinger ? 0.08 : 0) + (hasChest ? 0.05 : 0);

  let confidence = Math.min(
    1,
    agreement * 0.45 + meanQuality * 0.4 + coverageBoost + (valid.length >= 3 ? 0.08 : 0.02),
  );
  if (outliers.length > 0) confidence *= 0.9;
  if (outliers.length >= valid.length - 1) confidence *= 0.75;

  return {
    bpm: Math.round(bpm * 10) / 10,
    confidence,
    methods,
    outliers,
    timestamp,
    mode,
  };
}

export function methodLabel(id: MethodId): string {
  return METHOD_META[id].name;
}
