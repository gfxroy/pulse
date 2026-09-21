import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '../components/BrandMark';
import { CloseButton } from '../components/CloseButton';
import { BottomDock } from '../components/BottomDock';
import { SignalWaveform } from '../components/SignalWaveform';
import { QualityMeter } from '../components/QualityMeter';
import { CameraGuide } from '../components/CameraGuide';
import { VisualGuide } from '../components/VisualGuide';
import { PlacementCue } from '../components/PlacementCue';
import { METHOD_META, runMethod } from '../methods';
import type { LiveMeasurement, MethodId, MethodResult } from '../types';

interface Props {
  methodId: MethodId;
  onDone: (result: MethodResult) => void;
  onCancel: () => void;
  onBeat?: (bpm: number | null, active: boolean) => void;
}

type Phase = 'setup' | 'running' | 'done';

export function Measure({ methodId, onDone, onCancel, onBeat }: Props) {
  const meta = METHOD_META[methodId];
  const [phase, setPhase] = useState<Phase>('setup');
  const [live, setLive] = useState<LiveMeasurement | null>(null);
  const [result, setResult] = useState<MethodResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAltLight, setShowAltLight] = useState(false);
  const [altDismissed, setAltDismissed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      onBeat?.(null, false);
    };
  }, [onBeat]);

  useEffect(() => {
    if (phase === 'running') onBeat?.(live?.bpmLive ?? null, true);
    else if (phase === 'done') onBeat?.(result?.bpm ?? null, Boolean(result?.bpm));
    else onBeat?.(null, false);
  }, [phase, live?.bpmLive, result?.bpm, onBeat]);

  useEffect(() => {
    if (
      phase === 'running' &&
      methodId === 'fingertip_ppg' &&
      live?.camera?.needsAlternateLight &&
      !altDismissed &&
      !showAltLight
    ) {
      setShowAltLight(true);
    }
  }, [phase, methodId, live?.camera?.needsAlternateLight, altDismissed, showAltLight]);

  const start = async () => {
    setError(null);
    setPhase('running');
    setLive(null);
    setShowAltLight(false);
    setAltDismissed(false);
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
    onBeat?.(null, false);
    onCancel();
  };

  const elapsed = live ? Math.min(meta.durationSec, Math.floor(live.elapsedSec)) : 0;

  return (
    <div className={`screen screen--figma screen--measure${phase === 'running' ? ' is-live' : ''}`}>
      <header className="chrome">
        <CloseButton onClick={cancel} />
        <BrandMark />
        <span className="chrome__side" />
      </header>

      {phase === 'setup' && (
        <>
          <p className="setup-legal">
            Wellness estimate only not a medical device. Not for diagnosis or treatment.
          </p>
          <h2 className="setup-title">{meta.setupTitle}</h2>
          <VisualGuide methodId={methodId} leastPrecise={meta.leastPrecise} />
          {error && <p className="warn-text">{error}</p>}
          <button type="button" className="start-btn" onClick={() => void start()}>
            Start
          </button>
          <BottomDock
            title={meta.name}
            subtitle={meta.setupTitle.toLowerCase()}
            duration={`~ ${meta.durationSec} sec`}
            selected={methodId}
          />
        </>
      )}

      {phase === 'running' && (
        <div className="capture">
          <p className="capture-timer">
            {elapsed} | {meta.durationSec} s
          </p>

          {showAltLight && methodId === 'fingertip_ppg' && (
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
              showFlashHint={methodId === 'fingertip_ppg'}
            />
          )}

          {!live?.camera && !showAltLight && (
            <div className="capture-stage capture-stage--idle">
              <PlacementCue methodId={methodId} />
              <p className="capture-feed-label">{live?.status ?? 'Starting…'}</p>
            </div>
          )}

          {live && !live.camera && !showAltLight && (
            <div className="status-chip">{live.status}</div>
          )}

          <QualityMeter quality={live?.quality ?? 0} />
          <SignalWaveform samples={live?.waveform ?? []} height={96} />

          {methodId === 'fingertip_ppg' &&
            live?.camera?.needsAlternateLight &&
            altDismissed &&
            !showAltLight && (
              <button
                type="button"
                className="start-btn"
                onClick={() => setShowAltLight(true)}
              >
                Alternate light
              </button>
            )}

          <button type="button" className="pill pill--guided cancel-btn" onClick={cancel}>
            <span className="pill__title">Cancel</span>
          </button>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="done-card">
          <div className="home-readout">
            <img
              className="home-heart"
              src={`${import.meta.env.BASE_URL}figma/heart-clean.png`}
              alt=""
              width={291}
              height={291}
            />
            <div className="home-readout__num">
              <span className="home-bpm">
                {result.bpm != null ? Math.round(result.bpm) : '—'}
              </span>
              <span className="home-bpm-unit">BPM</span>
            </div>
          </div>
          {result.notes && <p className="home-checked">{result.notes}</p>}
          <button type="button" className="start-btn" onClick={() => onDone(result)}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
