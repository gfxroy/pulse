import { useMemo } from 'react';

interface Props {
  samples: number[];
  height?: number;
}

export function SignalWaveform({ samples, height = 88 }: Props) {
  const path = useMemo(() => {
    if (!samples.length) return '';
    const w = 300;
    const h = height;
    let min = Infinity;
    let max = -Infinity;
    for (const v of samples) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;
    const pts = samples.map((v, i) => {
      const x = (i / Math.max(1, samples.length - 1)) * w;
      const y = h - ((v - min) / range) * (h * 0.82) - h * 0.09;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${pts.join(' L ')}`;
  }, [samples, height]);

  return (
    <svg
      className="waveform"
      viewBox={`0 0 300 ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3dba9a" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#7ee0c3" stopOpacity="1" />
          <stop offset="100%" stopColor="#3dba9a" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <line x1="0" y1={height / 2} x2="300" y2={height / 2} className="waveform-mid" />
      {path ? (
        <path d={path} fill="none" stroke="url(#waveGrad)" strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        <text x="150" y={height / 2 + 4} textAnchor="middle" className="waveform-empty">
          Waiting for signal…
        </text>
      )}
    </svg>
  );
}
