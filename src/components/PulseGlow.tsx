import { useEffect, useRef } from 'react';

interface Props {
  bpm: number | null;
  active: boolean;
}

function lubdub(t: number): number {
  const s1 = Math.exp(-((t / 0.07) ** 2));
  const s2 = 0.42 * Math.exp(-(((t - 0.16) / 0.06) ** 2));
  return Math.min(1, s1 + s2);
}

export function PulseGlow({ bpm, active }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rateRef = useRef(72);
  const phaseRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!active || reduced) {
      el.style.setProperty('--pulse', '0.55');
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = bpm != null && bpm >= 35 && bpm <= 200 ? bpm : 72;
      rateRef.current += (target - rateRef.current) * Math.min(1, dt * 4);
      phaseRef.current = (phaseRef.current + (rateRef.current / 60) * dt) % 1;
      el.style.setProperty('--pulse', String(0.35 + lubdub(phaseRef.current) * 0.65));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, bpm]);

  return <div ref={ref} className="pulse-glow" aria-hidden />;
}
