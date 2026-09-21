/**
 * Instructional drawings for setup guides — ink-and-watercolor scenes,
 * not abstract geometry.
 */
import type { MethodId } from '../types';

export type GuideArtKey =
  | 'ppg_light'
  | 'ppg_alt_light'
  | 'ppg_cover'
  | 'ppg_still'
  | 'face_hold'
  | 'face_oval'
  | 'face_light'
  | 'face_still'
  | 'chest_lie'
  | 'chest_phone'
  | 'chest_still'
  | 'hand_grip'
  | 'hand_still'
  | 'mic_chest'
  | 'mic_quiet';

const ALT: Record<GuideArtKey, string> = {
  ppg_light: 'Phone face-down with the flashlight glowing',
  ppg_alt_light: 'A second phone shining light onto this camera while a fingertip covers the lens',
  ppg_cover: 'Fingertip covering the rear camera, glowing red from the flashlight',
  ppg_still: 'Two hands holding the phone still with a fingertip on the rear camera',
  face_hold: 'Person holding the phone at arm’s length, facing the camera',
  face_oval: 'Face centered in a dashed oval on the phone screen',
  face_light: 'Person sitting by a window with even light on their face',
  face_still: 'Person holding still while looking at the phone',
  chest_lie: 'Person lying on their back on a bed',
  chest_phone: 'Phone lying flat on the center of the chest',
  chest_still: 'Person lying still with a phone on their chest, breathing calmly',
  hand_grip: 'Both hands pressing the phone firmly against the chest',
  hand_still: 'Hands pinning the phone still against the chest',
  mic_chest: 'Bottom edge of the phone pressed against bare chest skin',
  mic_quiet: 'Quiet room — a hush gesture, no talking',
};

export function GuideArt({ art, className }: { art: GuideArtKey; className?: string }) {
  const src =
    art === 'ppg_cover'
      ? `${import.meta.env.BASE_URL}figma/guide-ppg.png`
      : `${import.meta.env.BASE_URL}guides/${art}.jpg`;
  return (
    <img
      src={src}
      alt={ALT[art]}
      className={className}
      draggable={false}
      width={1106}
      height={815}
    />
  );
}

export interface VisualStep {
  id: string;
  caption: string;
  art: GuideArtKey;
  altArt?: GuideArtKey;
  altCaption?: string;
  altToggleLabel?: string;
}

export const METHOD_VISUAL_STEPS: Record<MethodId, VisualStep[]> = {
  fingertip_ppg: [
    {
      id: 'cover',
      caption: 'Cover the rear lens fully with your fingertip.',
      art: 'ppg_cover',
      altArt: 'ppg_alt_light',
      altCaption: 'Or point another bright phone at the camera.',
      altToggleLabel: 'No flashlight?',
    },
    {
      id: 'light',
      caption: 'Turn flashlight on manually.',
      art: 'ppg_light',
    },
    {
      id: 'still',
      caption: 'Hold still — preview should glow red/orange.',
      art: 'ppg_still',
    },
  ],
  facial_rppg: [
    {
      id: 'hold',
      caption: 'Hold the phone at arm’s length.',
      art: 'face_hold',
    },
    {
      id: 'oval',
      caption: 'Center your face in the oval.',
      art: 'face_oval',
    },
    {
      id: 'light',
      caption: 'Use even front light — avoid backlight.',
      art: 'face_light',
    },
    {
      id: 'still',
      caption: 'Keep your head still.',
      art: 'face_still',
    },
  ],
  chest_motion: [
    {
      id: 'lie',
      caption: 'Lie on your back.',
      art: 'chest_lie',
    },
    {
      id: 'phone',
      caption: 'Place phone flat on your sternum, screen up.',
      art: 'chest_phone',
    },
    {
      id: 'still',
      caption: 'Breathe calmly. Stay still.',
      art: 'chest_still',
    },
  ],
  handheld_accel: [
    {
      id: 'grip',
      caption: 'Hold the phone firmly against your chest.',
      art: 'hand_grip',
    },
    {
      id: 'still',
      caption: 'Minimize tremor and talking.',
      art: 'hand_still',
    },
  ],
  mic_pcg: [
    {
      id: 'mic',
      caption: 'Press the bottom mic against bare chest skin.',
      art: 'mic_chest',
    },
    {
      id: 'quiet',
      caption: 'Stay quiet — no talking.',
      art: 'mic_quiet',
    },
  ],
};

export const PPG_ALT_LIGHT_STEPS: VisualStep[] = [
  {
    id: 'alt',
    caption: 'Point another phone’s bright screen/flash at this camera.',
    art: 'ppg_alt_light',
  },
  {
    id: 'cover',
    caption: 'Then cover this phone’s lens with your fingertip.',
    art: 'ppg_cover',
  },
  {
    id: 'still',
    caption: 'Hold both steady — transmitted light still works.',
    art: 'ppg_still',
  },
];
