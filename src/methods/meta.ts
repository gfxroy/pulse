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
      'Turn on your phone flashlight manually (Control Center / Quick Settings).',
      'Cover the rear camera and flash with your fingertip — gentle, steady pressure.',
      'Keep still. The preview should look glowing red/orange, not black or white.',
      'Hold for about 25 seconds while we measure.',
    ],
    goodSignalLooksLike:
      'A smooth, rhythmic red-channel waveform with clear peaks ~1 per second. Quality meter rises above 60%.',
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
      'Hold the phone at arm’s length, face well lit (natural light works best).',
      'Look at the camera; keep your head mostly still.',
      'Avoid strong backlight or flickering fluorescent lights.',
      'Stay in frame for about 30 seconds.',
    ],
    goodSignalLooksLike:
      'A gentle pulsatile waveform after a few seconds of settling. Face ROI outlined. Quality climbing steadily.',
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
      'Lie on your back in a quiet place.',
      'Place the phone flat on your sternum (center of chest), screen up.',
      'Breathe calmly; minimize talking and movement.',
      'Remain still for about 25 seconds.',
    ],
    goodSignalLooksLike:
      'Regular beat spikes on both accel and gyro traces that line up. Consensus peaks accepted.',
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
      'Sit or stand comfortably. Hold the phone still against your chest or in a firm grip.',
      'This method is the least precise — use only if others are unavailable.',
      'Minimize walking, talking, and hand tremor.',
      'Hold steady for about 35 seconds (longer averaging).',
    ],
    goodSignalLooksLike:
      'A weak but periodic envelope after strong noise suppression. Expect lower confidence.',
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
      'Place the phone mic (usually bottom edge) firmly against bare skin over the heart.',
      'Stay very still and quiet — no talking.',
      'A soft “lub-dub” should be audible if you listen with headphones.',
      'Record for about 25 seconds.',
    ],
    goodSignalLooksLike:
      'Paired S1–S2 energy lobes; systole shorter than diastole. Regular S1–S1 intervals.',
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
