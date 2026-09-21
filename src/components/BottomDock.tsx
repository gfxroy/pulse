import type { MethodId } from '../types';

/**
 * Dock icon crops from Figma sprite bd2746… / icons-sprite.png
 * imageTransform → background-size / background-position (STRETCH).
 * Visual order L→R matches home/setup frames: hand, mic, camera, phone, face.
 */
const ICONS: {
  id: MethodId;
  crop: string;
  tilt: number;
  rise: number;
  hero?: boolean;
}[] = [
  { id: 'handheld_accel', crop: 'hand', tilt: -16, rise: 18 },
  { id: 'mic_pcg', crop: 'mic', tilt: -8, rise: 10 },
  { id: 'fingertip_ppg', crop: 'cam', tilt: 0, rise: 0, hero: true },
  { id: 'chest_motion', crop: 'phone', tilt: 8, rise: 10 },
  { id: 'facial_rppg', crop: 'face', tilt: 16, rise: 18 },
];

interface Props {
  title: string;
  subtitle?: string;
  duration?: string;
  legal?: string;
  selected?: MethodId;
  onSelect?: (id: MethodId) => void;
}

export function BottomDock({ title, subtitle, duration, legal, selected, onSelect }: Props) {
  const base = import.meta.env.BASE_URL;
  return (
    <footer className="dock">
      <div className="dock__arc" aria-hidden />
      <div className="dock__icons">
        {ICONS.map((icon) => {
          const on = selected === icon.id;
          return (
            <button
              key={icon.id}
              type="button"
              className={`dock__icon${icon.hero ? ' dock__icon--hero' : ''}${on ? ' is-on' : ''}`}
              style={{
                transform: `rotate(${icon.tilt}deg)`,
                marginTop: icon.rise,
              }}
              onClick={() => onSelect?.(icon.id)}
              aria-label={icon.id.replace(/_/g, ' ')}
              aria-pressed={on || undefined}
            >
              <span
                className={`dock__sprite dock__sprite--${icon.crop}`}
                style={{ backgroundImage: `url(${base}figma/icons-sprite.png)` }}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
      <p className="dock__title">{title}</p>
      {subtitle && <p className="dock__sub">{subtitle}</p>}
      {duration && <p className="dock__dur">{duration}</p>}
      {legal && <p className="dock-legal">{legal}</p>}
    </footer>
  );
}
