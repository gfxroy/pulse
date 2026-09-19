import type { LiveMeasurement, MethodResult } from '../types';

export type LiveCallback = (live: LiveMeasurement) => void;

export interface MethodController {
  start: () => Promise<void>;
  stop: () => void;
}

export type MethodRunner = (
  onLive: LiveCallback,
  signal: AbortSignal,
) => Promise<MethodResult>;
