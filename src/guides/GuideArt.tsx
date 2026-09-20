/**
 * Sticker-like SVG illustrations for setup guides.
 * Warm paper + ink palette — no gradients kitsch.
 */
import type { ReactElement, ReactNode } from 'react';
import type { MethodId } from '../types';

const ink = '#1c1814';
const accent = '#c2342d';
const paper = '#faf6ef';
const muted = '#6e655c';
const soft = '#ebe2d4';
const warn = '#a65f12';

interface ArtProps {
  className?: string;
}

/** Shared phone silhouette (rear view for PPG). */
function Phone({
  x = 70,
  y = 18,
  w = 100,
  h = 160,
  face = false,
  children,
}: {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  face?: boolean;
  children?: ReactNode;
}) {
  const r = 12;
  return (
    <g transform={`translate(${x},${y})`}>
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={r}
        ry={r}
        fill={paper}
        stroke={ink}
        strokeWidth={2.5}
      />
      {face ? (
        <rect
          x={8}
          y={16}
          width={w - 16}
          height={h - 36}
          rx={4}
          fill={soft}
          stroke={ink}
          strokeWidth={1.2}
        />
      ) : (
        <>
          {/* rear camera cluster */}
          <circle cx={w - 22} cy={28} r={9} fill={soft} stroke={ink} strokeWidth={1.5} />
          <circle cx={w - 22} cy={28} r={4.5} fill={ink} />
          <circle cx={w - 38} cy={28} r={5} fill={soft} stroke={ink} strokeWidth={1.2} />
          <circle cx={w - 38} cy={28} r={2} fill={accent} />
        </>
      )}
      {children}
    </g>
  );
}

/** Finger tip sticker. */
function Finger({
  cx,
  cy,
  rot = -25,
  scale = 1,
}: {
  cx: number;
  cy: number;
  rot?: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${cx},${cy}) rotate(${rot}) scale(${scale})`}>
      <ellipse cx={0} cy={0} rx={22} ry={32} fill="#e8a09a" stroke={ink} strokeWidth={2} />
      <ellipse cx={-4} cy={-8} rx={8} ry={6} fill="#f0c4be" opacity={0.7} />
      <path
        d="M-18 18 Q-8 40 0 48 Q8 40 18 18"
        fill="#d48982"
        stroke={ink}
        strokeWidth={1.5}
      />
    </g>
  );
}

export function ArtPpgLight({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Turn on flashlight">
      <Phone x={70} y={20} />
      {/* flashlight rays */}
      <g stroke={warn} strokeWidth={2} fill="none" strokeLinecap="round">
        <path d="M148 28 L168 12" />
        <path d="M152 40 L178 36" />
        <path d="M148 50 L168 62" />
      </g>
      <circle cx={132} cy={48} r={7} fill={warn} stroke={ink} strokeWidth={1.5} />
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        FLASH ON
      </text>
    </svg>
  );
}

export function ArtPpgAltLight({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Use second phone as light">
      {/* measuring phone */}
      <Phone x={30} y={40} w={80} h={130} />
      {/* light phone facing it */}
      <g transform="translate(145,35)">
        <rect x={0} y={0} width={70} height={115} rx={10} fill={paper} stroke={ink} strokeWidth={2.5} />
        <rect x={6} y={12} width={58} height={88} rx={3} fill={soft} stroke={ink} strokeWidth={1} />
        <circle cx={35} cy={28} r={8} fill={warn} stroke={ink} strokeWidth={1.5} />
        {/* rays toward measuring phone */}
        <g stroke={warn} strokeWidth={1.8} fill="none" strokeLinecap="round" opacity={0.85}>
          <path d="M8 40 L-28 55" />
          <path d="M8 55 L-28 70" />
          <path d="M8 70 L-28 85" />
        </g>
      </g>
      <Finger cx={95} cy={95} rot={-15} scale={0.75} />
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={10} fontFamily="IBM Plex Mono, monospace">
        2ND PHONE LIGHT
      </text>
    </svg>
  );
}

export function ArtPpgCover({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Cover camera with fingertip">
      <Phone x={70} y={20} />
      <Finger cx={148} cy={55} rot={-30} scale={1.05} />
      {/* target ring */}
      <circle cx={148} cy={48} r={28} fill="none" stroke={accent} strokeWidth={2} strokeDasharray="4 3" />
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        COVER LENS
      </text>
    </svg>
  );
}

export function ArtPpgStill({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Hold still">
      <Phone x={70} y={20} />
      <Finger cx={148} cy={55} rot={-30} scale={1} />
      {/* stillness bars */}
      <g fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round">
        <path d="M40 100 H55" />
        <path d="M185 100 H200" />
      </g>
      <circle cx={120} cy={100} r={3} fill={accent} />
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        HOLD STILL
      </text>
    </svg>
  );
}

export function ArtFaceHold({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Hold phone at arm length">
      <Phone x={85} y={25} w={70} h={120} face />
      {/* arm / hand holding */}
      <path
        d="M70 150 Q50 165 55 185"
        fill="none"
        stroke={ink}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <ellipse cx={58} cy={178} rx={14} ry={10} fill="#e8a09a" stroke={ink} strokeWidth={1.5} />
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        ARM’S LENGTH
      </text>
    </svg>
  );
}

export function ArtFaceOval({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Center face in oval">
      <Phone x={75} y={15} w={90} h={150} face />
      {/* face oval guide */}
      <ellipse
        cx={120}
        cy={75}
        rx={28}
        ry={36}
        fill="none"
        stroke={accent}
        strokeWidth={2.5}
        strokeDasharray="5 3"
      />
      {/* simple face sticker */}
      <circle cx={120} cy={72} r={18} fill="#e8a09a" stroke={ink} strokeWidth={1.5} />
      <circle cx={113} cy={70} r={2} fill={ink} />
      <circle cx={127} cy={70} r={2} fill={ink} />
      <path d="M114 80 Q120 84 126 80" fill="none" stroke={ink} strokeWidth={1.5} />
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        CENTER FACE
      </text>
    </svg>
  );
}

export function ArtFaceLight({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Good even light">
      {/* sun / window light */}
      <circle cx={48} cy={40} r={16} fill={warn} stroke={ink} strokeWidth={2} />
      <g stroke={warn} strokeWidth={2} strokeLinecap="round">
        <path d="M48 14 V8" />
        <path d="M48 72 V66" />
        <path d="M22 40 H16" />
        <path d="M80 40 H74" />
        <path d="M28 22 L24 18" />
        <path d="M68 58 L72 62" />
        <path d="M68 22 L72 18" />
        <path d="M28 58 L24 62" />
      </g>
      <Phone x={95} y={25} w={70} h={120} face />
      <ellipse cx={130} cy={75} rx={20} ry={26} fill="none" stroke={accent} strokeWidth={2} />
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        EVEN LIGHT
      </text>
    </svg>
  );
}

export function ArtFaceStill({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Hold still">
      <Phone x={85} y={20} w={70} h={120} face />
      <ellipse cx={120} cy={70} rx={22} ry={28} fill="none" stroke={accent} strokeWidth={2} />
      <g stroke={ink} strokeWidth={2} strokeLinecap="round" fill="none">
        <path d="M55 95 H68" />
        <path d="M172 95 H185" />
      </g>
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        HOLD STILL
      </text>
    </svg>
  );
}

export function ArtChestLie({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Lie on your back">
      {/* body silhouette lying */}
      <ellipse cx={120} cy={130} rx={90} ry={28} fill={soft} stroke={ink} strokeWidth={2} />
      <circle cx={42} cy={120} r={18} fill="#e8a09a" stroke={ink} strokeWidth={2} />
      {/* legs hint */}
      <path d="M200 125 Q220 128 225 140" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" />
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        LIE DOWN
      </text>
    </svg>
  );
}

export function ArtChestPhone({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Phone flat on sternum">
      <ellipse cx={120} cy={125} rx={85} ry={32} fill={soft} stroke={ink} strokeWidth={2} />
      <circle cx={48} cy={115} r={16} fill="#e8a09a" stroke={ink} strokeWidth={2} />
      {/* sternum sticker target */}
      <circle cx={130} cy={118} r={22} fill="none" stroke={accent} strokeWidth={1.5} strokeDasharray="3 2" />
      {/* phone flat */}
      <g transform="translate(100,95) rotate(-8)">
        <rect x={0} y={0} width={55} height={90} rx={8} fill={paper} stroke={ink} strokeWidth={2.5} />
        <rect x={5} y={10} width={45} height={68} rx={2} fill={soft} stroke={ink} strokeWidth={1} />
      </g>
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        FLAT ON STERNUM
      </text>
    </svg>
  );
}

export function ArtChestStill({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Breathe calmly stay still">
      <ellipse cx={120} cy={120} rx={80} ry={30} fill={soft} stroke={ink} strokeWidth={2} />
      <g transform="translate(95,90)">
        <rect x={0} y={0} width={50} height={80} rx={8} fill={paper} stroke={ink} strokeWidth={2.5} />
      </g>
      {/* calm breath arcs */}
      <path d="M55 70 Q70 55 85 70" fill="none" stroke={muted} strokeWidth={1.5} />
      <path d="M155 70 Q170 55 185 70" fill="none" stroke={muted} strokeWidth={1.5} />
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        BREATHE · STILL
      </text>
    </svg>
  );
}

export function ArtHandGrip({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Natural grip against chest">
      {/* torso hint */}
      <ellipse cx={120} cy={140} rx={70} ry={35} fill={soft} stroke={ink} strokeWidth={2} />
      <Phone x={85} y={35} w={70} h={115} face />
      {/* grip hand */}
      <ellipse cx={75} cy={130} rx={18} ry={14} fill="#e8a09a" stroke={ink} strokeWidth={1.5} transform="rotate(-20 75 130)" />
      <ellipse cx={165} cy={130} rx={18} ry={14} fill="#e8a09a" stroke={ink} strokeWidth={1.5} transform="rotate(20 165 130)" />
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        FIRM GRIP
      </text>
    </svg>
  );
}

export function ArtHandStill({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Minimize tremor">
      <Phone x={85} y={30} w={70} h={115} face />
      <g stroke={ink} strokeWidth={2} strokeLinecap="round" fill="none">
        <path d="M50 95 H65" />
        <path d="M175 95 H190" />
      </g>
      {/* least precise badge drawn in parent */}
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        MINIMIZE MOTION
      </text>
    </svg>
  );
}

export function ArtMicChest({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Mic against bare chest">
      <ellipse cx={120} cy={130} rx={85} ry={32} fill={soft} stroke={ink} strokeWidth={2} />
      <circle cx={48} cy={120} r={16} fill="#e8a09a" stroke={ink} strokeWidth={2} />
      {/* heart area mark */}
      <path
        d="M118 105 C118 98 128 98 128 105 C128 112 118 118 118 118 C118 118 108 112 108 105 C108 98 118 98 118 105Z"
        fill={accent}
        opacity={0.35}
        stroke={accent}
        strokeWidth={1.5}
      />
      {/* phone mic edge against chest */}
      <g transform="translate(95,55) rotate(15)">
        <rect x={0} y={0} width={50} height={85} rx={8} fill={paper} stroke={ink} strokeWidth={2.5} />
        {/* mic dots at bottom */}
        <circle cx={18} cy={78} r={2.5} fill={ink} />
        <circle cx={25} cy={78} r={2.5} fill={ink} />
        <circle cx={32} cy={78} r={2.5} fill={ink} />
      </g>
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        MIC ON SKIN
      </text>
    </svg>
  );
}

export function ArtMicQuiet({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Quiet room">
      {/* crossed speaker / hush */}
      <circle cx={120} cy={85} r={48} fill={soft} stroke={ink} strokeWidth={2.5} />
      <path
        d="M100 70 L100 100 L118 100 L138 118 L138 52 L118 70 Z"
        fill={paper}
        stroke={ink}
        strokeWidth={2}
      />
      <path d="M148 70 Q160 85 148 100" fill="none" stroke={muted} strokeWidth={2} />
      <path d="M158 60 Q178 85 158 110" fill="none" stroke={muted} strokeWidth={2} />
      {/* ban slash */}
      <line x1={85} y1={55} x2={155} y2={115} stroke={accent} strokeWidth={3.5} strokeLinecap="round" />
      <text x={120} y={188} textAnchor="middle" fill={muted} fontSize={11} fontFamily="IBM Plex Mono, monospace">
        QUIET ROOM
      </text>
    </svg>
  );
}

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

const ART_MAP: Record<GuideArtKey, (p: ArtProps) => ReactElement> = {
  ppg_light: ArtPpgLight,
  ppg_alt_light: ArtPpgAltLight,
  ppg_cover: ArtPpgCover,
  ppg_still: ArtPpgStill,
  face_hold: ArtFaceHold,
  face_oval: ArtFaceOval,
  face_light: ArtFaceLight,
  face_still: ArtFaceStill,
  chest_lie: ArtChestLie,
  chest_phone: ArtChestPhone,
  chest_still: ArtChestStill,
  hand_grip: ArtHandGrip,
  hand_still: ArtHandStill,
  mic_chest: ArtMicChest,
  mic_quiet: ArtMicQuiet,
};

export function GuideArt({ art, className }: { art: GuideArtKey; className?: string }) {
  const Comp = ART_MAP[art];
  return <Comp className={className} />;
}

export interface VisualStep {
  id: string;
  caption: string;
  art: GuideArtKey;
  /** Optional alt art for light variants (PPG). */
  altArt?: GuideArtKey;
  altCaption?: string;
  altToggleLabel?: string;
}

export const METHOD_VISUAL_STEPS: Record<MethodId, VisualStep[]> = {
  fingertip_ppg: [
    {
      id: 'light',
      caption: 'Turn flashlight on manually.',
      art: 'ppg_light',
      altArt: 'ppg_alt_light',
      altCaption: 'Or point another bright phone at the camera.',
      altToggleLabel: 'No flashlight?',
    },
    {
      id: 'cover',
      caption: 'Cover the rear lens fully with your fingertip.',
      art: 'ppg_cover',
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

/** Standalone alternate-light flow for dark PPG prompt. */
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
