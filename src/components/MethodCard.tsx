import type { MethodMeta } from '../types';

interface Props {
  meta: MethodMeta;
  selected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
}

export function MethodCard({ meta, selected, onSelect, disabled }: Props) {
  return (
    <button
      type="button"
      className={`method-card ${selected ? 'method-card--selected' : ''} ${
        meta.leastPrecise ? 'method-card--caution' : ''
      }`}
      onClick={onSelect}
      disabled={disabled}
    >
      <div className="method-card__rank">#{meta.reliabilityRank}</div>
      <div className="method-card__body">
        <strong>{meta.name}</strong>
        <span>{meta.setupTitle}</span>
        {meta.leastPrecise && <em className="method-card__tag">Least precise</em>}
      </div>
      <div className="method-card__dur">~{meta.durationSec}s</div>
    </button>
  );
}
