import { useEffect, useRef, useState } from 'react';
import { Disclaimer } from '../components/Disclaimer';
import { SignalWaveform } from '../components/SignalWaveform';
import { QualityMeter } from '../components/QualityMeter';
import { BpmDisplay } from '../components/BpmDisplay';
import { CameraGuide } from '../components/CameraGuide';
import { VisualGuide } from '../components/VisualGuide';
import { PlacementCue } from '../components/PlacementCue';
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

const CAMERA_METHODS: MethodId[] = ['fingertip_ppg', 'facial_rppg'];

export function Composite({ caps, onDone, onCancel }: Props) {
  const queue = availableMethods(caps);
  const [phase, setPhase] = useState<Phase>('overview');
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<MethodResult[]>([]);
  const [live, setLive] = useState<LiveMeasurement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fused, setFused] = useState<CompositeResult | null>(null);
  const [showAltLight, setShowAltLight] = useState(false);
  const [altDismissed, setAltDismissed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const current = queue[index];
  const isCamera = current ? CAMERA_METHODS.includes(current.id) : false;

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (
      phase === 'running' &&
      current?.id === 'fingertip_ppg' &&
      live?.camera?.needsAlternateLight &&
      !altDismissed &&
      !showAltLight
    ) {
      setShowAltLight(true);
    }
  }, [phase, current?.id, live?.camera?.needsAlternateLight, altDismissed, showAltLight]);

  const beginMethod = () => {
    setPhase('setup');
    setError(null);
    setLive(null);
    setShowAltLight(false);
    setAltDismissed(false);
  };

  const startCurrent = async () => {
    if (!current) return;
    setPhase('running');
    setShowAltLight(false);
    setAltDismissed(false);
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
        setShowAltLight(false);
        setAltDismissed(false);
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
      setShowAltLight(false);
      setAltDismissed(false);
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
          <p className="cta-kicker">Sequence</p>
          <h2>{queue.length} methods</h2>
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
        <section
          className={`card${phase === 'running' && isCamera ? ' card--camera' : ''}${
            phase === 'setup' ? ' card--visual-setup' : ''
          }`}
        >
          <div className="step-indicator">
            Method {index + 1} of {queue.length}
          </div>
          <h2>{current.setupTitle}</h2>

          {phase === 'setup' && (
            <>
              <VisualGuide methodId={current.id} leastPrecise={current.leastPrecise} />
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
              {showAltLight && current.id === 'fingertip_ppg' && (
                <div className="alt-light-overlay">
                  <VisualGuide
                    methodId="fingertip_ppg"
                    compact
                    alternateLightOnly
                    onDismissAlternate={() => {
                      setShowAltLight(false);
                      setAltDismissed(true);
                    }}
                  />
                </div>
              )}

              {live?.camera && !showAltLight && (
                <CameraGuide
                  guide={live.camera}
                  status={live.status}
                  showFlashHint={current.id === 'fingertip_ppg'}
                />
              )}
              {!live?.camera && !showAltLight && (
                <div className="live-visual-cue">
                  <PlacementCue methodId={current.id} />
                  <p className="live-status">{live?.status ?? 'Starting…'}</p>
                </div>
              )}
              <div className="live-meta">
                <div className="progress-chip">
                  {live ? Math.min(current.durationSec, Math.ceil(live.elapsedSec)) : 0}
                  <span>/{current.durationSec}s</span>
                </div>
                {live?.bpmLive != null && (
                  <div className="live-bpm-chip">~{Math.round(live.bpmLive)} BPM</div>
                )}
              </div>
              <SignalWaveform samples={live?.waveform ?? []} height={72} />
              <QualityMeter quality={live?.quality ?? 0} />
              {current.id === 'fingertip_ppg' &&
                live?.camera?.needsAlternateLight &&
                altDismissed &&
                !showAltLight && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--block"
                    onClick={() => setShowAltLight(true)}
                  >
                    Show alternate light guide
                  </button>
                )}
            </>
          )}
        </section>
      )}

      {phase === 'summary' && fused && (
        <section className="card card--highlight">
          <p className="cta-kicker">Fusion</p>
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
