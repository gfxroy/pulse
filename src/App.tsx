import { useCallback, useEffect, useState } from 'react';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { Measure } from './screens/Measure';
import { Composite } from './screens/Composite';
import { Results } from './screens/Results';
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

  const persist = useCallback((result: CompositeResult) => {
    setLatest(result);
    saveHistoryEntry(result);
    refreshHistory();
    setScreen('results');
  }, [refreshHistory]);

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

  const onQuick = (methodId: MethodId) => {
    setMeasureMethod(methodId);
    setScreen('measure');
  };

  const onMeasureDone = (result: MethodResult) => {
    persist(fuseResults([result], 'single'));
  };

  if (screen === 'onboarding') {
    return (
      <Onboarding
        caps={caps}
        probing={probing}
        onComplete={onOnboardingComplete}
      />
    );
  }

  if (!caps) {
    return (
      <div className="screen">
        <p className="muted">Loading capabilities…</p>
      </div>
    );
  }

  if (screen === 'measure' && measureMethod) {
    return (
      <Measure
        methodId={measureMethod}
        onDone={onMeasureDone}
        onCancel={() => setScreen('home')}
      />
    );
  }

  if (screen === 'composite') {
    return (
      <Composite
        caps={caps}
        onDone={persist}
        onCancel={() => setScreen('home')}
      />
    );
  }

  if (screen === 'results') {
    return (
      <Results
        latest={latest}
        history={history}
        onBack={() => setScreen('home')}
        onHistoryChange={refreshHistory}
      />
    );
  }

  return (
    <Home
      caps={caps}
      onQuick={onQuick}
      onComposite={() => setScreen('composite')}
      onHistory={() => setScreen('results')}
      historyCount={history.length}
    />
  );
}
