import type { MethodId } from '../types';

const ICONS: { id: MethodId; file: string; tilt: number }[] = [
  { id: 'handheld_accel', file: 'icon-ll.png', tilt: -16 },
  { id: 'mic_pcg', file: 'icon-l.png', tilt: -8 },
  { id: 'fingertip_ppg', file: 'icon-center.png', tilt: 0 },
  { id: 'chest_motion', file: 'icon-r.png', tilt: 8 },
  { id: 'facial_rppg', file: 'icon-rr.png', tilt: 16 },
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
              className={`dock__icon${icon.id === 'fingertip_ppg' ? ' dock__icon--hero' : ''}${on ? ' is-on' : ''}`}
              style={{ transform: `rotate(${icon.tilt}deg)` }}
              onClick={() => onSelect?.(icon.id)}
              aria-label={icon.id.replace(/_/g, ' ')}
            >
              <img
                src={`${base}figma/${icon.file}`}
                alt=""
                draggable={false}
                width={188}
                height={185}
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
