import { Disclaimer } from './Disclaimer';

interface Props {
  bpm: number | null;
  confidence?: number;
  subtitle?: string;
}

export function BpmDisplay({ bpm, confidence, subtitle }: Props) {
  return (
    <div className="bpm-display">
      <div className="bpm-display__value" aria-live="polite">
        {bpm != null ? Math.round(bpm) : '—'}
        <span className="bpm-display__unit">BPM</span>
      </div>
      {confidence != null && (
        <div className="bpm-display__conf">
          Confidence {Math.round(confidence * 100)}%
        </div>
      )}
      {subtitle && <div className="bpm-display__sub">{subtitle}</div>}
      <Disclaimer compact />
    </div>
  );
}
