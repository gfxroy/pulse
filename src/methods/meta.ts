import type { MethodId, MethodMeta, Capabilities } from '../types';

export const METHOD_META: Record<MethodId, MethodMeta> = {
  fingertip_ppg: {
    id: 'fingertip_ppg',
    name: 'Fingertip PPG',
    shortName: 'Finger',
    reliabilityRank: 1,
    durationSec: 25,
    requires: ['rearCamera'],
    setupTitle: 'Fingertip over rear camera',
    setupSteps: [
      'Flashlight on — or another phone’s bright light facing the camera.',
      'Cover the rear lens fully with your fingertip.',
      'Hold still; preview should glow red/orange.',
    ],
    goodSignalLooksLike:
      'Smooth rhythmic waveform; quality above ~60%.',
  },
  facial_rppg: {
    id: 'facial_rppg',
    name: 'Facial rPPG',
    shortName: 'Face',
    reliabilityRank: 3,
    durationSec: 30,
    requires: ['frontCamera'],
    setupTitle: 'Face the front camera',
    setupSteps: [
      'Hold at arm’s length.',
      'Center face in the oval.',
      'Even front light; hold still.',
    ],
    goodSignalLooksLike:
      'Gentle pulsatile waveform; face ROI locked; quality climbing.',
  },
  chest_motion: {
    id: 'chest_motion',
    name: 'Chest accel + gyro',
    shortName: 'Chest',
    reliabilityRank: 2,
    durationSec: 25,
    requires: ['motion'],
    setupTitle: 'Phone on sternum (lying down)',
    setupSteps: [
      'Lie on your back.',
      'Phone flat on sternum, screen up.',
      'Breathe calmly; stay still.',
    ],
    goodSignalLooksLike:
      'Aligned accel/gyro beat spikes; consensus peaks.',
  },
  handheld_accel: {
    id: 'handheld_accel',
    name: 'Handheld grip accel',
    shortName: 'Handheld',
    reliabilityRank: 5,
    durationSec: 35,
    requires: ['motion'],
    setupTitle: 'Hold phone steadily (least precise)',
    setupSteps: [
      'Firm grip against chest.',
      'Minimize tremor — least precise method.',
    ],
    goodSignalLooksLike:
      'Weak periodic envelope; expect lower confidence.',
    leastPrecise: true,
  },
  mic_pcg: {
    id: 'mic_pcg',
    name: 'Mic phonocardiography',
    shortName: 'Mic',
    reliabilityRank: 4,
    durationSec: 25,
    requires: ['microphone'],
    setupTitle: 'Microphone against bare chest',
    setupSteps: [
      'Mic against bare chest skin.',
      'Quiet room — no talking.',
    ],
    goodSignalLooksLike:
      'Paired S1–S2 lobes; regular S1–S1 intervals.',
  },
};

export function isMethodAvailable(id: MethodId, caps: Capabilities): boolean {
  const meta = METHOD_META[id];
  return meta.requires.every((key) => {
    if (key === 'rearCamera') return caps.rearCamera;
    if (key === 'frontCamera') return caps.frontCamera;
    if (key === 'microphone') return caps.microphone;
    if (key === 'motion') return caps.motion;
    return false;
  });
}

export function availableMethods(caps: Capabilities): MethodMeta[] {
  return (Object.keys(METHOD_META) as MethodId[])
    .map((id) => METHOD_META[id])
    .filter((m) => isMethodAvailable(m.id, caps))
    .sort((a, b) => a.reliabilityRank - b.reliabilityRank);
}

export function bestMethod(caps: Capabilities): MethodMeta | null {
  const list = availableMethods(caps);
  return list[0] ?? null;
}
