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

/** Normalized ROI in video coordinates (0–1). */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CameraCueLevel = 'bad' | 'warn' | 'good';

export interface CameraGuideLive {
  mode: 'fingertip' | 'face';
  /** Active preview stream — same reference across frames. */
  stream: MediaStream;
  /** Mirror preview (front camera). */
  mirror: boolean;
  cueLevel: CameraCueLevel;
  /** Fingertip: mean red in target crop. */
  meanRed?: number;
  /** Fingertip: red / (g+b) dominance. */
  redDominance?: number;
  /** Face: FaceDetector currently has a lock. */
  faceDetected?: boolean;
  /** Face: measured ROI (forehead/cheeks) or guide fallback, normalized. */
  roi?: NormRect;
  /** Face: whether roi is from detector vs center guide. */
  roiLocked?: boolean;
}

export interface LiveMeasurement {
  waveform: number[];
  quality: number; // 0–1
  bpmLive: number | null;
  elapsedSec: number;
  status: string;
  camera?: CameraGuideLive;
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
