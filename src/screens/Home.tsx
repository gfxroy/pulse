import { BrandMark } from '../components/BrandMark';
import { BottomDock } from '../components/BottomDock';
import { availableMethods, bestMethod } from '../methods';
import type { Capabilities, HistoryEntry, MethodId } from '../types';

interface Props {
  caps: Capabilities;
  onQuick: (methodId: MethodId) => void;
  onComposite: () => void;
  onHistory: () => void;
  history: HistoryEntry[];
}

function formatLastChecked(ts: number): string {
  const d = new Date(ts);
  const day = d.getDate();
  const mon = d.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'Pm' : 'Am';
  h = h % 12 || 12;
  return `last checked at ${day} ${mon} ${h}:${min} ${ap}`;
}

export function Home({ caps, onQuick, onComposite, onHistory, history }: Props) {
  const methods = availableMethods(caps);
  const best = bestMethod(caps);
  const canComposite = methods.length >= 2;
  const latest = history.find((h) => h.result.bpm != null) ?? history[0];
  const bpm = latest?.result.bpm != null ? Math.round(latest.result.bpm) : null;

  return (
    <div className="screen screen--figma screen--home">
      <header className="chrome">
        <span className="chrome__side" />
        <BrandMark />
        <button type="button" className="chrome__hist" onClick={onHistory}>
          ···
        </button>
      </header>

      <div className="home-hero-bpm">
        {latest && (
          <p className="home-checked">{formatLastChecked(latest.result.timestamp)}</p>
        )}
        <div className="home-readout">
          <img
            className="home-heart"
            src={`${import.meta.env.BASE_URL}figma/heart-clean.png`}
            alt=""
            width={291}
            height={291}
            draggable={false}
          />
          <div className="home-readout__num">
            <span className="home-bpm">{bpm ?? '—'}</span>
            <span className="home-bpm-unit">BPM</span>
          </div>
        </div>
      </div>

      <div className="home-actions">
        <button
          type="button"
          className="pill pill--quick"
          disabled={!best}
          onClick={() => best && onQuick(best.id)}
        >
          <span className="pill__title">Quick Check</span>
          <span className="pill__hint">Single best available method</span>
        </button>
        <button
          type="button"
          className="pill pill--guided"
          disabled={!canComposite}
          onClick={onComposite}
        >
          <span className="pill__title">Guided Scan</span>
          <span className="pill__hint">avg of all the methods combine</span>
        </button>
      </div>

      <BottomDock
        title="HOME"
        onSelect={(id) => methods.some((m) => m.id === id) && onQuick(id)}
        legal="Wellness estimate only not a medical device. Not for diagnosis or treatment."
      />
    </div>
  );
}
