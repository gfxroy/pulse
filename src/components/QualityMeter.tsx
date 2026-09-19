interface Props {
  quality: number; // 0–1
  label?: string;
}

export function QualityMeter({ quality, label = 'Signal quality' }: Props) {
  const pct = Math.round(Math.max(0, Math.min(1, quality)) * 100);
  let tone: 'low' | 'mid' | 'high' = 'low';
  if (pct >= 65) tone = 'high';
  else if (pct >= 35) tone = 'mid';

  return (
    <div className="quality-meter" aria-label={`${label}: ${pct}%`}>
      <div className="quality-meter__header">
        <span>{label}</span>
        <span className={`quality-meter__pct quality-meter__pct--${tone}`}>{pct}%</span>
      </div>
      <div className="quality-meter__track">
        <div
          className={`quality-meter__fill quality-meter__fill--${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
