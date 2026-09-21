import { Disclaimer } from '../components/Disclaimer';
import { BpmDisplay } from '../components/BpmDisplay';
import { methodLabel } from '../fusion/fuse';
import { clearHistory } from '../storage/history';
import type { CompositeResult, HistoryEntry } from '../types';

interface Props {
  latest: CompositeResult | null;
  history: HistoryEntry[];
  onBack: () => void;
  onHistoryChange: () => void;
}

export function Results({ latest, history, onBack, onHistoryChange }: Props) {
  return (
    <div className="screen screen--results">
      <header className="topbar">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Home
        </button>
        <h1>Results</h1>
        <span className="topbar__spacer" />
      </header>

      <Disclaimer compact />

      {latest && (
        <section className="card card--highlight">
          <h2>Your reading</h2>
          <BpmDisplay
            bpm={latest.bpm}
            confidence={latest.confidence}
            subtitle={latest.mode === 'composite' ? 'Composite scan' : 'Single method'}
          />
          <ul className="result-breakdown">
            {latest.methods.map((m) => (
              <li key={m.methodId}>
                <span>{methodLabel(m.methodId)}</span>
                <span>{m.bpm != null ? `${Math.round(m.bpm)} BPM` : '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="section-label">History</p>
      <section className="card card--history">
        <div className="card__row">
          <h2 className="card__subhead">Past readings</h2>
          {history.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                clearHistory();
                onHistoryChange();
              }}
            >
              Clear
            </button>
          )}
        </div>
        {history.length === 0 && <p className="muted">No saved readings yet.</p>}
        <ul className="history-list">
          {history.map((h) => (
            <li key={h.id}>
              <div>
                <strong>
                  {h.result.bpm != null ? `${Math.round(h.result.bpm)} BPM` : '—'}
                </strong>
                <span className="muted">
                  {' '}
                  · {h.result.mode} · conf {Math.round(h.result.confidence * 100)}%
                </span>
              </div>
              <time dateTime={new Date(h.result.timestamp).toISOString()}>
                {formatWhen(h.result.timestamp)}
              </time>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function formatWhen(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}
