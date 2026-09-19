import { Disclaimer } from '../components/Disclaimer';
import { MethodCard } from '../components/MethodCard';
import { availableMethods, bestMethod } from '../methods';
import type { Capabilities, MethodId } from '../types';

interface Props {
  caps: Capabilities;
  onQuick: (methodId: MethodId) => void;
  onComposite: () => void;
  onHistory: () => void;
  historyCount: number;
}

export function Home({ caps, onQuick, onComposite, onHistory, historyCount }: Props) {
  const methods = availableMethods(caps);
  const best = bestMethod(caps);
  const canComposite = methods.length >= 2;

  return (
    <div className="screen screen--home">
      <header className="topbar">
        <h1>Pulse Wellness</h1>
        <button type="button" className="btn btn--ghost" onClick={onHistory}>
          History{historyCount > 0 ? ` (${historyCount})` : ''}
        </button>
      </header>

      <Disclaimer compact />

      <section className="card card--highlight">
        <p className="cta-kicker">Recommended</p>
        <h2>Quick check</h2>
        <p className="muted">
          Single best available method
          {best ? `: ${best.name}` : ' — none available on this device'}.
        </p>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!best}
          onClick={() => best && onQuick(best.id)}
        >
          Start quick check
        </button>
      </section>

      <section className="card">
        <p className="cta-kicker">Multi-sensor</p>
        <h2>Guided scan</h2>
        <p className="muted">
          Run each available method in sequence, then fuse with confidence weighting.
          {canComposite
            ? ` ${methods.length} methods ready.`
            : ' Needs at least 2 available methods.'}
        </p>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={!canComposite}
          onClick={onComposite}
        >
          Start guided scan
        </button>
      </section>

      <p className="section-label">Available methods</p>
      <section className="card" style={{ marginTop: '0.35rem' }}>
        <div className="method-list">
          {methods.length === 0 && (
            <p className="warn-text">
              No sensors available. Use a phone browser over HTTPS and allow permissions.
            </p>
          )}
          {methods.map((m) => (
            <MethodCard key={m.id} meta={m} onSelect={() => onQuick(m.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}
