/**
 * Premium figurative SVG scenes for setup guides.
 * Ink + blood-red accent + cream — instantly readable placements.
 */
import type { ReactElement, ReactNode } from 'react';
import type { MethodId } from '../types';

const ink = '#1c1814';
const accent = '#c2342d';
const paper = '#faf6ef';
const muted = '#6e655c';
const soft = '#ebe2d4';
const warn = '#a65f12';
const skin = '#e8a09a';
const skinDeep = '#d48982';
const skinLight = '#f0c4be';

interface ArtProps {
  className?: string;
}

function Caption({ children }: { children: string }) {
  return (
    <text
      x={120}
      y={192}
      textAnchor="middle"
      fill={muted}
      fontSize={10}
      fontFamily="IBM Plex Mono, monospace"
      letterSpacing="0.08em"
    >
      {children}
    </text>
  );
}

/** Recognizable phone — rear or face, with camera cluster / home indicator. */
function Phone({
  x = 70,
  y = 18,
  w = 100,
  h = 160,
  face = false,
  rot = 0,
  children,
}: {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  face?: boolean;
  rot?: number;
  children?: ReactNode;
}) {
  const r = 14;
  const cx = w / 2;
  return (
    <g transform={`translate(${x},${y}) rotate(${rot} ${cx} ${h / 2})`}>
      {/* body */}
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={r}
        ry={r}
        fill={paper}
        stroke={ink}
        strokeWidth={2.4}
      />
      {/* subtle side bevel */}
      <rect
        x={2.5}
        y={2.5}
        width={w - 5}
        height={h - 5}
        rx={r - 2}
        ry={r - 2}
        fill="none"
        stroke={soft}
        strokeWidth={1}
      />
      {face ? (
        <>
          {/* screen */}
          <rect
            x={7}
            y={14}
            width={w - 14}
            height={h - 34}
            rx={5}
            fill={soft}
            stroke={ink}
            strokeWidth={1.1}
          />
          {/* notch / speaker */}
          <rect
            x={cx - 12}
            y={7}
            width={24}
            height={4}
            rx={2}
            fill={ink}
            opacity={0.35}
          />
          {/* home indicator */}
          <rect
            x={cx - 14}
            y={h - 12}
            width={28}
            height={3.5}
            rx={1.75}
            fill={ink}
            opacity={0.45}
          />
        </>
      ) : (
        <>
          {/* rear camera cluster — top-left (or top-right depending on orientation) */}
          <rect
            x={12}
            y={14}
            width={36}
            height={28}
            rx={8}
            fill={soft}
            stroke={ink}
            strokeWidth={1.4}
          />
          {/* main lens */}
          <circle cx={24} cy={28} r={7} fill={ink} opacity={0.85} />
          <circle cx={24} cy={28} r={3.2} fill="#3a342e" />
          {/* second lens */}
          <circle cx={40} cy={24} r={4.5} fill={ink} opacity={0.7} />
          <circle cx={40} cy={24} r={1.8} fill="#3a342e" />
          {/* flash / LED */}
          <circle cx={40} cy={36} r={2.8} fill={warn} stroke={ink} strokeWidth={0.9} />
          {/* branding line */}
          <line
            x1={cx - 10}
            y1={h - 18}
            x2={cx + 10}
            y2={h - 18}
            stroke={ink}
            strokeWidth={1.2}
            opacity={0.25}
            strokeLinecap="round"
          />
        </>
      )}
      {children}
    </g>
  );
}

/** Clear fingertip — oval pad + nail highlight + knuckle taper. */
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
      {/* finger shaft */}
      <path
        d="M-16 8
           C-20 28 -18 52 -10 68
           C-4 78 4 78 10 68
           C18 52 20 28 16 8
           C14 -6 8 -18 0 -22
           C-8 -18 -14 -6 -16 8 Z"
        fill={skin}
        stroke={ink}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* nail */}
      <ellipse cx={0} cy={-8} rx={9} ry={11} fill={skinLight} stroke={ink} strokeWidth={1.3} />
      <ellipse cx={-1} cy={-10} rx={4} ry={3} fill="#fff" opacity={0.35} />
      {/* crease */}
      <path
        d="M-10 22 Q0 26 10 22"
        fill="none"
        stroke={skinDeep}
        strokeWidth={1.2}
        opacity={0.7}
      />
    </g>
  );
}

/** Simple face outline — oval head, eyes, nose hint, soft smile. */
function Face({
  cx,
  cy,
  rx = 28,
  ry = 36,
  fill = skin,
}: {
  cx: number;
  cy: number;
  rx?: number;
  ry?: number;
  fill?: string;
}) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} stroke={ink} strokeWidth={2} />
      {/* hair hint */}
      <path
        d={`M${cx - rx * 0.85} ${cy - ry * 0.2}
            Q${cx - rx * 0.5} ${cy - ry * 1.15} ${cx} ${cy - ry * 0.95}
            Q${cx + rx * 0.5} ${cy - ry * 1.15} ${cx + rx * 0.85} ${cy - ry * 0.2}`}
        fill={ink}
        opacity={0.12}
        stroke="none"
      />
      <circle cx={cx - rx * 0.32} cy={cy - ry * 0.08} r={2.4} fill={ink} />
      <circle cx={cx + rx * 0.32} cy={cy - ry * 0.08} r={2.4} fill={ink} />
      <path
        d={`M${cx - 2} ${cy + 2} Q${cx} ${cy + 8} ${cx + 2} ${cy + 2}`}
        fill="none"
        stroke={ink}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <path
        d={`M${cx - rx * 0.28} ${cy + ry * 0.32} Q${cx} ${cy + ry * 0.48} ${cx + rx * 0.28} ${cy + ry * 0.32}`}
        fill="none"
        stroke={ink}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </g>
  );
}

/** Side-view person lying on back — head left, torso, legs right. */
function PersonLying({
  y = 118,
  showSternum = false,
}: {
  y?: number;
  showSternum?: boolean;
}) {
  return (
    <g>
      {/* mattress / surface line */}
      <line
        x1={18}
        y1={y + 42}
        x2={222}
        y2={y + 42}
        stroke={ink}
        strokeWidth={1.5}
        opacity={0.25}
        strokeLinecap="round"
      />
      {/* torso / body */}
      <ellipse cx={118} cy={y + 18} rx={72} ry={22} fill={soft} stroke={ink} strokeWidth={2} />
      {/* shoulder bump */}
      <ellipse cx={62} cy={y + 8} rx={18} ry={12} fill={soft} stroke={ink} strokeWidth={1.8} />
      {/* head */}
      <ellipse cx={38} cy={y} rx={16} ry={14} fill={skin} stroke={ink} strokeWidth={2} />
      {/* nose hint (facing up) */}
      <ellipse cx={38} cy={y - 12} rx={5} ry={3.5} fill={skinDeep} stroke={ink} strokeWidth={1} />
      {/* arm along body */}
      <path
        d={`M70 ${y + 22} Q95 ${y + 38} 130 ${y + 34}`}
        fill="none"
        stroke={skin}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <path
        d={`M70 ${y + 22} Q95 ${y + 38} 130 ${y + 34}`}
        fill="none"
        stroke={ink}
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.5}
      />
      {/* legs */}
      <path
        d={`M185 ${y + 14} Q210 ${y + 10} 220 ${y + 28}`}
        fill="none"
        stroke={soft}
        strokeWidth={14}
        strokeLinecap="round"
      />
      <path
        d={`M185 ${y + 14} Q210 ${y + 10} 220 ${y + 28}`}
        fill="none"
        stroke={ink}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* foot */}
      <ellipse cx={224} cy={y + 32} rx={8} ry={5} fill={soft} stroke={ink} strokeWidth={1.5} />
      {showSternum && (
        <circle
          cx={118}
          cy={y + 10}
          r={18}
          fill="none"
          stroke={accent}
          strokeWidth={1.8}
          strokeDasharray="4 3"
          opacity={0.9}
        />
      )}
    </g>
  );
}

/** Hand holding phone from the side / bottom. */
function HoldingHand({
  cx,
  cy,
  flip = false,
}: {
  cx: number;
  cy: number;
  flip?: boolean;
}) {
  const s = flip ? -1 : 1;
  return (
    <g transform={`translate(${cx},${cy}) scale(${s},1)`}>
      {/* palm */}
      <path
        d="M0 0
           C-8 6 -14 18 -12 32
           C-10 44 -2 52 10 50
           C22 48 28 38 26 26
           C24 14 16 4 0 0 Z"
        fill={skin}
        stroke={ink}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {/* thumb */}
      <path
        d="M8 8 C18 0 28 4 30 14 C32 22 26 28 18 26"
        fill={skin}
        stroke={ink}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {/* fingers curled */}
      <path
        d="M-6 28 C-14 34 -12 46 -4 48"
        fill="none"
        stroke={ink}
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.35}
      />
    </g>
  );
}

// ─── PPG ───────────────────────────────────────────────────────────

export function ArtPpgLight({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Turn on flashlight">
      <Phone x={70} y={12} w={100} h={155} />
      {/* flash glow */}
      <circle cx={110} cy={48} r={10} fill={warn} opacity={0.35} />
      <circle cx={110} cy={48} r={5} fill={warn} stroke={ink} strokeWidth={1.4} />
      {/* rays */}
      <g stroke={warn} strokeWidth={2.2} fill="none" strokeLinecap="round">
        <path d="M122 36 L142 18" />
        <path d="M128 48 L152 48" />
        <path d="M122 60 L142 78" />
      </g>
      <Caption>FLASH ON</Caption>
    </svg>
  );
}

export function ArtPpgAltLight({ className }: ArtProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 200"
      role="img"
      aria-label="Use second phone as light"
    >
      {/* measuring phone (rear) */}
      <Phone x={18} y={28} w={88} h={140} />
      <Finger cx={48} cy={58} rot={-20} scale={0.72} />
      {/* second phone casting light — face toward first */}
      <g transform="translate(138,22)">
        <rect
          x={0}
          y={0}
          width={78}
          height={128}
          rx={12}
          fill={paper}
          stroke={ink}
          strokeWidth={2.4}
        />
        <rect
          x={6}
          y={12}
          width={66}
          height={100}
          rx={4}
          fill="#fff8e8"
          stroke={ink}
          strokeWidth={1.1}
        />
        {/* bright screen glow */}
        <circle cx={39} cy={55} r={18} fill={warn} opacity={0.45} />
        <circle cx={39} cy={55} r={8} fill={warn} stroke={ink} strokeWidth={1.2} />
        {/* home indicator */}
        <rect x={25} y={118} width={28} height={3} rx={1.5} fill={ink} opacity={0.4} />
        {/* light rays toward measuring phone */}
        <g stroke={warn} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.9}>
          <path d="M6 40 L-22 52" />
          <path d="M6 55 L-22 68" />
          <path d="M6 70 L-22 84" />
        </g>
      </g>
      <Caption>2ND PHONE LIGHT</Caption>
    </svg>
  );
}

export function ArtPpgCover({ className }: ArtProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 200"
      role="img"
      aria-label="Cover camera with fingertip"
    >
      <Phone x={70} y={12} w={100} h={155} />
      {/* target ring around lens cluster */}
      <circle
        cx={100}
        cy={42}
        r={26}
        fill="none"
        stroke={accent}
        strokeWidth={2}
        strokeDasharray="5 3"
      />
      <Finger cx={100} cy={48} rot={-18} scale={1.05} />
      <Caption>COVER LENS</Caption>
    </svg>
  );
}

export function ArtPpgStill({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Hold still">
      <Phone x={70} y={12} w={100} h={155} />
      <Finger cx={100} cy={48} rot={-18} scale={1} />
      {/* stillness brackets */}
      <g fill="none" stroke={ink} strokeWidth={2.2} strokeLinecap="round">
        <path d="M42 70 V55 H55" />
        <path d="M42 110 V125 H55" />
        <path d="M198 70 V55 H185" />
        <path d="M198 110 V125 H185" />
      </g>
      <circle cx={120} cy={90} r={3.5} fill={accent} />
      <Caption>HOLD STILL</Caption>
    </svg>
  );
}

// ─── Facial rPPG ───────────────────────────────────────────────────

export function ArtFaceHold({ className }: ArtProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 200"
      role="img"
      aria-label="Hold phone at arm length"
    >
      {/* face at left (viewer / subject) */}
      <Face cx={48} cy={72} rx={26} ry={34} />
      {/* neck / shoulder hint */}
      <path
        d="M32 104 Q48 118 64 104"
        fill="none"
        stroke={skin}
        strokeWidth={10}
        strokeLinecap="round"
      />
      <path
        d="M32 104 Q48 118 64 104"
        fill="none"
        stroke={ink}
        strokeWidth={1.5}
        opacity={0.4}
      />
      {/* arm extending to phone */}
      <path
        d="M68 112 Q110 130 145 118"
        fill="none"
        stroke={skin}
        strokeWidth={9}
        strokeLinecap="round"
      />
      <path
        d="M68 112 Q110 130 145 118"
        fill="none"
        stroke={ink}
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.45}
      />
      <HoldingHand cx={148} cy={108} />
      <Phone x={152} y={28} w={62} h={105} face />
      {/* distance arc label */}
      <path
        d="M78 55 Q115 40 150 55"
        fill="none"
        stroke={accent}
        strokeWidth={1.4}
        strokeDasharray="3 2"
        opacity={0.7}
      />
      <Caption>ARM'S LENGTH</Caption>
    </svg>
  );
}

export function ArtFaceOval({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Center face in oval">
      <Phone x={68} y={8} w={104} h={165} face />
      {/* dashed oval guide on screen */}
      <ellipse
        cx={120}
        cy={78}
        rx={30}
        ry={40}
        fill="none"
        stroke={accent}
        strokeWidth={2.4}
        strokeDasharray="5 3"
      />
      <Face cx={120} cy={78} rx={22} ry={30} />
      <Caption>CENTER FACE</Caption>
    </svg>
  );
}

export function ArtFaceLight({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Good even light">
      {/* window / light source */}
      <g>
        <rect
          x={14}
          y={22}
          width={48}
          height={58}
          rx={3}
          fill="#fff8e8"
          stroke={ink}
          strokeWidth={2}
        />
        <line x1={38} y1={22} x2={38} y2={80} stroke={ink} strokeWidth={1.3} />
        <line x1={14} y1={51} x2={62} y2={51} stroke={ink} strokeWidth={1.3} />
        {/* light rays */}
        <g stroke={warn} strokeWidth={1.8} strokeLinecap="round" opacity={0.8}>
          <path d="M66 40 L88 48" />
          <path d="M66 55 L92 62" />
          <path d="M66 70 L88 78" />
        </g>
      </g>
      <Phone x={100} y={22} w={70} h={118} face />
      <ellipse
        cx={135}
        cy={70}
        rx={20}
        ry={26}
        fill="none"
        stroke={accent}
        strokeWidth={1.8}
        strokeDasharray="4 2"
      />
      <Face cx={135} cy={70} rx={14} ry={18} />
      <Caption>EVEN LIGHT</Caption>
    </svg>
  );
}

export function ArtFaceStill({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Hold still">
      <Phone x={78} y={12} w={84} h={140} face />
      <Face cx={120} cy={70} rx={20} ry={26} />
      <ellipse
        cx={120}
        cy={70}
        rx={26}
        ry={34}
        fill="none"
        stroke={accent}
        strokeWidth={1.8}
      />
      {/* stillness brackets */}
      <g fill="none" stroke={ink} strokeWidth={2.2} strokeLinecap="round">
        <path d="M48 60 V48 H60" />
        <path d="M48 100 V112 H60" />
        <path d="M192 60 V48 H180" />
        <path d="M192 100 V112 H180" />
      </g>
      <Caption>HOLD STILL</Caption>
    </svg>
  );
}

// ─── Chest IMU ─────────────────────────────────────────────────────

export function ArtChestLie({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Lie on your back">
      <PersonLying y={95} />
      <Caption>LIE DOWN</Caption>
    </svg>
  );
}

export function ArtChestPhone({ className }: ArtProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 200"
      role="img"
      aria-label="Phone flat on sternum"
    >
      <PersonLying y={95} showSternum />
      {/* phone flat on chest, screen up */}
      <g transform="translate(92,78) rotate(-6)">
        <rect
          x={0}
          y={0}
          width={52}
          height={86}
          rx={9}
          fill={paper}
          stroke={ink}
          strokeWidth={2.3}
        />
        <rect
          x={5}
          y={10}
          width={42}
          height={64}
          rx={3}
          fill={soft}
          stroke={ink}
          strokeWidth={1}
        />
        <rect x={16} y={78} width={20} height={3} rx={1.5} fill={ink} opacity={0.4} />
      </g>
      <Caption>FLAT ON STERNUM</Caption>
    </svg>
  );
}

export function ArtChestStill({ className }: ArtProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 200"
      role="img"
      aria-label="Breathe calmly stay still"
    >
      <PersonLying y={100} />
      <g transform="translate(92,82)">
        <rect
          x={0}
          y={0}
          width={48}
          height={78}
          rx={8}
          fill={paper}
          stroke={ink}
          strokeWidth={2.2}
        />
      </g>
      {/* calm breath arcs */}
      <path
        d="M48 58 Q62 42 76 58"
        fill="none"
        stroke={muted}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <path
        d="M164 58 Q178 42 192 58"
        fill="none"
        stroke={muted}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Caption>BREATHE · STILL</Caption>
    </svg>
  );
}

// ─── Handheld ──────────────────────────────────────────────────────

export function ArtHandGrip({ className }: ArtProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 200"
      role="img"
      aria-label="Natural grip against chest"
    >
      {/* torso / chest */}
      <ellipse cx={120} cy={155} rx={78} ry={38} fill={soft} stroke={ink} strokeWidth={2} />
      {/* neck */}
      <path
        d="M108 118 Q120 108 132 118"
        fill="none"
        stroke={skin}
        strokeWidth={12}
        strokeLinecap="round"
      />
      {/* phone held to chest */}
      <Phone x={88} y={28} w={64} h={108} face />
      {/* left hand grip */}
      <HoldingHand cx={78} cy={105} />
      {/* right hand grip (flipped) */}
      <HoldingHand cx={162} cy={105} flip />
      <Caption>FIRM GRIP</Caption>
    </svg>
  );
}

export function ArtHandStill({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Minimize tremor">
      <Phone x={85} y={22} w={70} h={118} face />
      <HoldingHand cx={78} cy={115} />
      <HoldingHand cx={162} cy={115} flip />
      {/* stillness brackets */}
      <g fill="none" stroke={ink} strokeWidth={2.2} strokeLinecap="round">
        <path d="M48 70 V55 H62" />
        <path d="M48 120 V135 H62" />
        <path d="M192 70 V55 H178" />
        <path d="M192 120 V135 H178" />
      </g>
      <Caption>MINIMIZE MOTION</Caption>
    </svg>
  );
}

// ─── Mic PCG ───────────────────────────────────────────────────────

export function ArtMicChest({ className }: ArtProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 200"
      role="img"
      aria-label="Mic against bare chest"
    >
      {/* upright torso (front view simplified) */}
      <ellipse cx={120} cy={148} rx={70} ry={36} fill={soft} stroke={ink} strokeWidth={2} />
      {/* shoulders */}
      <ellipse cx={70} cy={118} rx={22} ry={14} fill={soft} stroke={ink} strokeWidth={1.8} />
      <ellipse cx={170} cy={118} rx={22} ry={14} fill={soft} stroke={ink} strokeWidth={1.8} />
      {/* neck + head */}
      <path
        d="M108 100 Q120 88 132 100"
        fill="none"
        stroke={skin}
        strokeWidth={11}
        strokeLinecap="round"
      />
      <ellipse cx={120} cy={72} rx={20} ry={22} fill={skin} stroke={ink} strokeWidth={2} />
      {/* heart / placement mark */}
      <circle
        cx={128}
        cy={130}
        r={16}
        fill={accent}
        opacity={0.18}
        stroke={accent}
        strokeWidth={1.6}
      />
      <path
        d="M128 122 C128 118 134 118 134 122 C134 128 128 134 128 134 C128 134 122 128 122 122 C122 118 128 118 128 122Z"
        fill={accent}
        opacity={0.55}
      />
      {/* phone bottom (mic edge) pressed to chest */}
      <g transform="translate(98,78) rotate(12)">
        <rect
          x={0}
          y={0}
          width={48}
          height={78}
          rx={9}
          fill={paper}
          stroke={ink}
          strokeWidth={2.3}
        />
        {/* mic grille at bottom edge */}
        <circle cx={16} cy={70} r={2.2} fill={ink} />
        <circle cx={24} cy={70} r={2.2} fill={ink} />
        <circle cx={32} cy={70} r={2.2} fill={ink} />
        <rect x={14} y={8} width={20} height={3} rx={1.5} fill={ink} opacity={0.3} />
      </g>
      <Caption>MIC ON SKIN</Caption>
    </svg>
  );
}

export function ArtMicQuiet({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 240 200" role="img" aria-label="Quiet room">
      <circle cx={120} cy={82} r={52} fill={soft} stroke={ink} strokeWidth={2.4} />
      {/* speaker icon */}
      <path
        d="M98 64 L98 100 L116 100 L138 120 L138 44 L116 64 Z"
        fill={paper}
        stroke={ink}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M148 66 Q160 82 148 98"
        fill="none"
        stroke={muted}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M158 54 Q178 82 158 110"
        fill="none"
        stroke={muted}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* ban slash */}
      <line
        x1={82}
        y1={48}
        x2={158}
        y2={116}
        stroke={accent}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <Caption>QUIET ROOM</Caption>
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
