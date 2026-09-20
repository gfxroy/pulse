/**
 * Confidence-weighted fusion — NOT a flat average.
 * Weights = method quality × reliability prior.
 * Outliers >15 BPM from weighted consensus are down-weighted hard.
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

const OUTLIER_BPM = 15;

export function fuseResults(
  methods: MethodResult[],
  mode: 'single' | 'composite' = 'composite',
): CompositeResult {
  const timestamp = Date.now();
  const valid = methods.filter(
    (m) =>
      m.bpm != null &&
      Number.isFinite(m.bpm!) &&
      m.bpm! >= 40 &&
      m.bpm! <= 200 &&
      m.confidence > 0.08,
  );

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

  const weights = valid.map((m) => {
    const q = Math.max(0.05, m.quality);
    const conf = Math.max(0.05, m.confidence);
    return q * conf * RELIABILITY[m.methodId];
  });

  let wSum = weights.reduce((a, b) => a + b, 0) || 1;
  let bpm =
    valid.reduce((acc, m, i) => acc + (m.bpm as number) * weights[i], 0) / wSum;

  const outliers: MethodId[] = [];
  let adjustedWeights = [...weights];

  for (let iter = 0; iter < 2; iter++) {
    wSum = adjustedWeights.reduce((a, b) => a + b, 0) || 1;
    bpm =
      valid.reduce((acc, m, i) => acc + (m.bpm as number) * adjustedWeights[i], 0) /
      wSum;

    adjustedWeights = weights.map((w, i) => {
      const diff = Math.abs((valid[i].bpm as number) - bpm);
      if (diff > OUTLIER_BPM) {
        if (iter === 1 && !outliers.includes(valid[i].methodId)) {
          outliers.push(valid[i].methodId);
        }
        return w * 0.05;
      }
      if (diff > 10) return w * 0.35;
      if (diff > 6) return w * 0.7;
      return w;
    });
  }

  wSum = adjustedWeights.reduce((a, b) => a + b, 0) || 1;
  bpm =
    valid.reduce((acc, m, i) => acc + (m.bpm as number) * adjustedWeights[i], 0) / wSum;

  const effective = valid
    .map((m, i) => ({ m, w: adjustedWeights[i] }))
    .filter((x) => x.w > wSum * 0.08);
  if (effective.length === 1) {
    bpm = effective[0].m.bpm as number;
  }

  const activeSpreads = valid
    .map((m, i) => ({
      diff: Math.abs((m.bpm as number) - bpm),
      w: adjustedWeights[i],
    }))
    .filter((x) => x.w > wSum * 0.05);
  const meanSpread =
    activeSpreads.length > 0
      ? activeSpreads.reduce((a, x) => a + x.diff, 0) / activeSpreads.length
      : 20;
  const agreement = Math.max(0, 1 - meanSpread / 15);

  const meanQuality =
    valid.reduce((a, m, i) => a + m.quality * adjustedWeights[i], 0) / wSum;

  const hasFinger = valid.some(
    (m) => m.methodId === 'fingertip_ppg' && !outliers.includes(m.methodId),
  );
  const hasChest = valid.some(
    (m) => m.methodId === 'chest_motion' && !outliers.includes(m.methodId),
  );
  const coverageBoost = (hasFinger ? 0.08 : 0) + (hasChest ? 0.05 : 0);

  let confidence = Math.min(
    1,
    agreement * 0.45 +
      meanQuality * 0.4 +
      coverageBoost +
      (effective.length >= 2 ? 0.08 : 0.02),
  );
  if (outliers.length > 0) confidence *= 0.88;
  if (outliers.length >= valid.length - 1) confidence *= 0.7;

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
