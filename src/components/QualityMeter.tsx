interface Props {
  quality: number;
  label?: string;
}

export function QualityMeter({ quality, label = 'Signal quality' }: Props) {
  const pct = Math.round(Math.max(0, Math.min(1, quality)) * 100);
  const word = pct >= 65 ? 'Good' : pct >= 35 ? 'Hold' : 'Weak';

  return (
    <div className="quality-meter" aria-label={`${label}: ${word}`}>
      <div className="quality-meter__header">
        <span>{label}</span>
        <span>{word}</span>
      </div>
      <div className="quality-meter__track">
        <div className="quality-meter__fill" style={{ width: `${Math.max(8, pct)}%` }} />
      </div>
    </div>
  );
}
