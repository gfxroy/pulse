import { useEffect, useRef, useState } from 'react';
import { Disclaimer } from '../components/Disclaimer';
import { SignalWaveform } from '../components/SignalWaveform';
import { QualityMeter } from '../components/QualityMeter';
import { BpmDisplay } from '../components/BpmDisplay';
import { METHOD_META, runMethod } from '../methods';
import type { LiveMeasurement, MethodId, MethodResult } from '../types';

interface Props {
  methodId: MethodId;
  onDone: (result: MethodResult) => void;
  onCancel: () => void;
}

type Phase = 'setup' | 'running' | 'done';

export function Measure({ methodId, onDone, onCancel }: Props) {
  const meta = METHOD_META[methodId];
  const [phase, setPhase] = useState<Phase>('setup');
  const [live, setLive] = useState<LiveMeasurement | null>(null);
  const [result, setResult] = useState<MethodResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const start = async () => {
    setError(null);
    setPhase('running');
    setLive(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await runMethod(methodId, setLive, ac.signal);
      setResult(res);
      setPhase('done');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message || 'Measurement failed');
      setPhase('setup');
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    onCancel();
  };

  return (
    <div className="screen screen--measure">
      <header className="topbar">
        <button type="button" className="btn btn--ghost" onClick={cancel}>
          ← Back
        </button>
        <h1>{meta.shortName}</h1>
        <span className="topbar__spacer" />
      </header>

      <Disclaimer compact />

      {phase === 'setup' && (
        <section className="card">
          <h2>{meta.setupTitle}</h2>
          <ol className="setup-steps">
            {meta.setupSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="callout callout--soft">
            <strong>What good signal looks like</strong>
            <p>{meta.goodSignalLooksLike}</p>
          </div>
          {meta.leastPrecise && (
            <p className="warn-text">This is the least precise method.</p>
          )}
          {methodId === 'fingertip_ppg' && (
            <p className="warn-text">
              Flashlight must be turned on manually. This app never controls the torch.
            </p>
          )}
          {error && <p className="warn-text">{error}</p>}
          <button type="button" className="btn btn--primary" onClick={() => void start()}>
            I’m ready — start (~{meta.durationSec}s)
          </button>
        </section>
      )}

      {phase === 'running' && (
        <section className="card card--live">
          <div className="progress-ring">
            <span>
              {live ? Math.min(meta.durationSec, Math.ceil(live.elapsedSec)) : 0}
              <small> / {meta.durationSec}s</small>
            </span>
          </div>
          <p className="live-status">{live?.status ?? 'Starting…'}</p>
          <SignalWaveform samples={live?.waveform ?? []} />
          <QualityMeter quality={live?.quality ?? 0} />
          {live?.bpmLive != null && (
            <p className="live-bpm">
              Live estimate ~{Math.round(live.bpmLive)} BPM
            </p>
          )}
          <Disclaimer compact />
          <button type="button" className="btn btn--ghost" onClick={cancel}>
            Cancel
          </button>
        </section>
      )}

      {phase === 'done' && result && (
        <section className="card">
          <h2>Reading</h2>
          <BpmDisplay
            bpm={result.bpm}
            confidence={result.confidence}
            subtitle={`${meta.name}${result.snrDb != null ? ` · SNR ${result.snrDb.toFixed(1)} dB` : ''}`}
          />
          {result.notes && <p className="muted">{result.notes}</p>}
          <button type="button" className="btn btn--primary" onClick={() => onDone(result)}>
            Continue
          </button>
        </section>
      )}
    </div>
  );
}
