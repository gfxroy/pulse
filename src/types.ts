export type MethodId =
  | 'fingertip_ppg'
  | 'facial_rppg'
  | 'chest_motion'
  | 'handheld_accel'
  | 'mic_pcg';

export interface Capabilities {
  rearCamera: boolean;
  frontCamera: boolean;
  microphone: boolean;
  motion: boolean;
  motionPermissionNeeded: boolean;
  faceDetector: boolean;
  secureContext: boolean;
}

export interface MethodMeta {
  id: MethodId;
  name: string;
  shortName: string;
  reliabilityRank: number; // lower = more reliable
  durationSec: number;
  requires: (keyof Capabilities)[];
  setupTitle: string;
  setupSteps: string[];
  goodSignalLooksLike: string;
  leastPrecise?: boolean;
}

export interface LiveMeasurement {
  waveform: number[];
  quality: number; // 0–1
  bpmLive: number | null;
  elapsedSec: number;
  status: string;
}

export interface MethodResult {
  methodId: MethodId;
  bpm: number | null;
  quality: number; // 0–1 SNR-derived
  confidence: number; // 0–1
  durationSec: number;
  peakCount?: number;
  snrDb?: number;
  notes?: string;
  timestamp: number;
}

export interface CompositeResult {
  bpm: number | null;
  confidence: number;
  methods: MethodResult[];
  outliers: MethodId[];
  timestamp: number;
  mode: 'single' | 'composite';
}

export interface HistoryEntry {
  id: string;
  result: CompositeResult;
  label?: string;
}

export type Screen =
  | 'onboarding'
  | 'home'
  | 'measure'
  | 'composite'
  | 'results';
