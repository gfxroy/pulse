import { useEffect, useRef, useState } from 'react';
import { Disclaimer } from '../components/Disclaimer';
import { SignalWaveform } from '../components/SignalWaveform';
import { QualityMeter } from '../components/QualityMeter';
import { BpmDisplay } from '../components/BpmDisplay';
import { CameraGuide } from '../components/CameraGuide';
import { METHOD_META, runMethod } from '../methods';
import type { LiveMeasurement, MethodId, MethodResult } from '../types';

interface Props {
  methodId: MethodId;
  onDone: (result: MethodResult) => void;
  onCancel: () => void;
}

type Phase = 'setup' | 'running' | 'done';

const CAMERA_METHODS: MethodId[] = ['fingertip_ppg', 'facial_rppg'];

export function Measure({ methodId, onDone, onCancel }: Props) {
  const meta = METHOD_META[methodId];
  const [phase, setPhase] = useState<Phase>('setup');
  const [live, setLive] = useState<LiveMeasurement | null>(null);
  const [result, setResult] = useState<MethodResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isCamera = CAMERA_METHODS.includes(methodId);

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
            <p className="hint-text">
              Flashlight must be turned on manually. This app never controls the torch.
            </p>
          )}
          {error && <p className="warn-text">{error}</p>}
          <button type="button" className="btn btn--primary" onClick={() => void start()}>
            Start — ~{meta.durationSec}s
          </button>
        </section>
      )}

      {phase === 'running' && (
        <section className={`card card--live${isCamera ? ' card--camera' : ''}`}>
          {live?.camera && (
            <CameraGuide
              guide={live.camera}
              status={live.status}
              showFlashHint={methodId === 'fingertip_ppg'}
            />
          )}

          {!live?.camera && (
            <p className="live-status">{live?.status ?? 'Starting…'}</p>
          )}

          <div className="live-meta">
            <div className="progress-chip" aria-label="Elapsed time">
              {live ? Math.min(meta.durationSec, Math.ceil(live.elapsedSec)) : 0}
              <span>/{meta.durationSec}s</span>
            </div>
            {live?.bpmLive != null && (
              <div className="live-bpm-chip">~{Math.round(live.bpmLive)} BPM</div>
            )}
          </div>

          <SignalWaveform samples={live?.waveform ?? []} height={64} />
          <QualityMeter quality={live?.quality ?? 0} />

          <button type="button" className="btn btn--ghost btn--block" onClick={cancel}>
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
