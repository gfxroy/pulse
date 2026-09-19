import type { MethodId, MethodResult } from '../types';
import type { LiveCallback } from './types';
import { runFingertipPpg } from './fingertipPpg';
import { runFacialRppg } from './facialRppg';
import { runChestMotion } from './chestMotion';
import { runHandheldAccel } from './handheldAccel';
import { runMicPcg } from './micPcg';

export { METHOD_META, availableMethods, bestMethod, isMethodAvailable } from './meta';
export type { LiveCallback } from './types';

export async function runMethod(
  id: MethodId,
  onLive: LiveCallback,
  signal: AbortSignal,
): Promise<MethodResult> {
  switch (id) {
    case 'fingertip_ppg':
      return runFingertipPpg(onLive, signal);
    case 'facial_rppg':
      return runFacialRppg(onLive, signal);
    case 'chest_motion':
      return runChestMotion(onLive, signal);
    case 'handheld_accel':
      return runHandheldAccel(onLive, signal);
    case 'mic_pcg':
      return runMicPcg(onLive, signal);
    default:
      throw new Error(`Unknown method: ${id}`);
  }
}
