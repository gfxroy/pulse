import { useCallback, useEffect, useState } from 'react';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { Measure } from './screens/Measure';
import { Composite } from './screens/Composite';
import { Results } from './screens/Results';
import { PulseGlow } from './components/PulseGlow';
import { probeCapabilities } from './capabilities/probe';
import { fuseResults } from './fusion/fuse';
import { loadHistory, saveHistoryEntry } from './storage/history';
import type {
  Capabilities,
  CompositeResult,
  HistoryEntry,
  MethodId,
  MethodResult,
  Screen,
} from './types';

const ONBOARD_KEY = 'pulse-wellness-onboarded-v1';

export default function App() {
  const [screen, setScreen] = useState<Screen>('onboarding');
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [probing, setProbing] = useState(true);
  const [measureMethod, setMeasureMethod] = useState<MethodId | null>(null);
  const [latest, setLatest] = useState<CompositeResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [beatBpm, setBeatBpm] = useState<number | null>(null);
  const [beating, setBeating] = useState(false);

  const onBeat = useCallback((bpm: number | null, active: boolean) => {
    setBeatBpm(bpm);
    setBeating(active);
  }, []);

  useEffect(() => {
    setHistory(loadHistory());
    const done = localStorage.getItem(ONBOARD_KEY) === '1';
    void (async () => {
      setProbing(true);
      try {
        const c = await probeCapabilities();
        setCaps(c);
      } finally {
        setProbing(false);
      }
      if (done) setScreen('home');
    })();
  }, []);

  const refreshHistory = useCallback(() => {
    setHistory(loadHistory());
  }, []);

  const persist = useCallback(
    (result: CompositeResult) => {
      setLatest(result);
      saveHistoryEntry(result);
      refreshHistory();
      setBeating(false);
      setScreen('home');
    },
    [refreshHistory],
  );

  const onOnboardingComplete = (motionGranted: boolean) => {
    localStorage.setItem(ONBOARD_KEY, '1');
    setCaps((prev) =>
      prev
        ? {
            ...prev,
            motion: prev.motion && (prev.motionPermissionNeeded ? motionGranted : true),
          }
        : prev,
    );
    setScreen('home');
  };

  const goHome = () => {
    onBeat(null, false);
    setScreen('home');
  };

  const body =
    screen === 'onboarding' ? (
      <Onboarding caps={caps} probing={probing} onComplete={onOnboardingComplete} />
    ) : !caps ? (
      <div className="screen screen--figma">
        <p className="home-checked">Loading…</p>
      </div>
    ) : screen === 'measure' && measureMethod ? (
      <Measure
        methodId={measureMethod}
        onDone={(result: MethodResult) => persist(fuseResults([result], 'single'))}
        onCancel={goHome}
        onBeat={onBeat}
      />
    ) : screen === 'composite' ? (
      <Composite caps={caps} onDone={persist} onCancel={goHome} />
    ) : screen === 'results' ? (
      <Results
        latest={latest}
        history={history}
        onBack={goHome}
        onHistoryChange={refreshHistory}
      />
    ) : (
      <Home
        caps={caps}
        onQuick={(id) => {
          setMeasureMethod(id);
          setScreen('measure');
        }}
        onComposite={() => setScreen('composite')}
        onHistory={() => setScreen('results')}
        history={history}
      />
    );

  return (
    <>
      <PulseGlow bpm={beatBpm} active={beating} />
      {body}
    </>
  );
}
