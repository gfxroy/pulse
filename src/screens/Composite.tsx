import { useEffect, useRef, useState } from 'react';
import { Disclaimer } from '../components/Disclaimer';
import { SignalWaveform } from '../components/SignalWaveform';
import { QualityMeter } from '../components/QualityMeter';
import { BpmDisplay } from '../components/BpmDisplay';
import { availableMethods, METHOD_META, runMethod } from '../methods';
import { fuseResults, methodLabel } from '../fusion/fuse';
import type {
  Capabilities,
  CompositeResult,
  LiveMeasurement,
  MethodId,
  MethodResult,
} from '../types';

interface Props {
  caps: Capabilities;
  onDone: (result: CompositeResult) => void;
  onCancel: () => void;
}

type Phase = 'overview' | 'setup' | 'running' | 'summary';

export function Composite({ caps, onDone, onCancel }: Props) {
  const queue = availableMethods(caps);
  const [phase, setPhase] = useState<Phase>('overview');
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<MethodResult[]>([]);
  const [live, setLive] = useState<LiveMeasurement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fused, setFused] = useState<CompositeResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const current = queue[index];

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const beginMethod = () => {
    setPhase('setup');
    setError(null);
    setLive(null);
  };

  const startCurrent = async () => {
    if (!current) return;
    setPhase('running');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await runMethod(current.id, setLive, ac.signal);
      const nextResults = [...results, res];
      setResults(nextResults);
      if (index + 1 < queue.length) {
        setIndex(index + 1);
        setPhase('setup');
        setLive(null);
      } else {
        const fusedResult = fuseResults(nextResults, 'composite');
        setFused(fusedResult);
        setPhase('summary');
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message || 'Method failed');
      setPhase('setup');
    }
  };

  const skipCurrent = () => {
    if (index + 1 < queue.length) {
      setIndex(index + 1);
      setPhase('setup');
      setLive(null);
      setError(null);
    } else {
      const fusedResult = fuseResults(results, 'composite');
      setFused(fusedResult);
      setPhase('summary');
    }
  };

  return (
    <div className="screen screen--composite">
      <header className="topbar">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            abortRef.current?.abort();
            onCancel();
          }}
        >
          ← Back
        </button>
        <h1>Guided scan</h1>
        <span className="topbar__spacer" />
      </header>

      <Disclaimer compact />

      {phase === 'overview' && (
        <section className="card">
          <h2>Sequence ({queue.length} methods)</h2>
          <ol className="setup-steps">
            {queue.map((m) => (
              <li key={m.id}>
                <strong>{m.name}</strong> — ~{m.durationSec}s
                {m.leastPrecise ? ' (least precise)' : ''}
              </li>
            ))}
          </ol>
          <p className="muted">
            Results are fused with confidence weights (finger &gt; chest &gt; face &gt; mic &gt;
            handheld). Methods that disagree with consensus are flagged.
          </p>
          <button type="button" className="btn btn--primary" onClick={beginMethod}>
            Begin first method
          </button>
        </section>
      )}

      {(phase === 'setup' || phase === 'running') && current && (
        <section className="card">
          <div className="step-indicator">
            Method {index + 1} of {queue.length}
          </div>
          <h2>{current.setupTitle}</h2>

          {phase === 'setup' && (
            <>
              <ol className="setup-steps">
                {current.setupSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <div className="callout callout--soft">
                <strong>What good signal looks like</strong>
                <p>{current.goodSignalLooksLike}</p>
              </div>
              {current.id === 'fingertip_ppg' && (
                <p className="warn-text">
                  Turn flashlight on manually. Torch API is never used.
                </p>
              )}
              {error && <p className="warn-text">{error}</p>}
              <div className="btn-row">
                <button type="button" className="btn btn--primary" onClick={() => void startCurrent()}>
                  Start (~{current.durationSec}s)
                </button>
                <button type="button" className="btn btn--ghost" onClick={skipCurrent}>
                  Skip
                </button>
              </div>
            </>
          )}

          {phase === 'running' && (
            <>
              <p className="live-status">{live?.status ?? 'Starting…'}</p>
              <div className="progress-ring">
                <span>
                  {live ? Math.min(current.durationSec, Math.ceil(live.elapsedSec)) : 0}
                  <small> / {current.durationSec}s</small>
                </span>
              </div>
              <SignalWaveform samples={live?.waveform ?? []} />
              <QualityMeter quality={live?.quality ?? 0} />
              <Disclaimer compact />
            </>
          )}
        </section>
      )}

      {phase === 'summary' && fused && (
        <section className="card">
          <h2>Composite result</h2>
          <BpmDisplay
            bpm={fused.bpm}
            confidence={fused.confidence}
            subtitle="Confidence-weighted fusion"
          />

          <ul className="result-breakdown">
            {fused.methods.map((m) => (
              <li
                key={m.methodId}
                className={
                  fused.outliers.includes(m.methodId) ? 'result-breakdown--outlier' : ''
                }
              >
                <span>{methodLabel(m.methodId)}</span>
                <span>
                  {m.bpm != null ? `${Math.round(m.bpm)} BPM` : '—'}
                  {' · '}
                  Q {Math.round(m.quality * 100)}%
                  {fused.outliers.includes(m.methodId) ? ' · outlier' : ''}
                </span>
              </li>
            ))}
          </ul>

          {fused.outliers.length > 0 && (
            <p className="warn-text">
              Flagged outlier
              {fused.outliers.length > 1 ? 's' : ''}:{' '}
              {fused.outliers.map((id: MethodId) => METHOD_META[id].shortName).join(', ')}{' '}
              (down-weighted in fusion).
            </p>
          )}

          <button type="button" className="btn btn--primary" onClick={() => onDone(fused)}>
            Save & finish
          </button>
        </section>
      )}
    </div>
  );
}
