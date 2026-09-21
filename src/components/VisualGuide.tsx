import { useState } from 'react';
import {
  GuideArt,
  METHOD_VISUAL_STEPS,
  PPG_ALT_LIGHT_STEPS,
  type VisualStep,
} from '../guides/GuideArt';
import type { MethodId } from '../types';

interface Props {
  methodId: MethodId;
  leastPrecise?: boolean;
  compact?: boolean;
  alternateLightOnly?: boolean;
  onDismissAlternate?: () => void;
}

export function VisualGuide({
  methodId,
  leastPrecise,
  compact,
  alternateLightOnly,
  onDismissAlternate,
}: Props) {
  const steps: VisualStep[] = alternateLightOnly
    ? PPG_ALT_LIGHT_STEPS
    : METHOD_VISUAL_STEPS[methodId];
  const [index, setIndex] = useState(0);
  const [useAlt, setUseAlt] = useState(false);

  const step = steps[Math.min(index, steps.length - 1)];
  const showingAlt = Boolean(useAlt && step.altArt);
  const art = showingAlt && step.altArt ? step.altArt : step.art;
  const caption = showingAlt && step.altCaption ? step.altCaption : step.caption;

  const go = (dir: -1 | 1) => {
    setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + dir)));
    setUseAlt(false);
  };

  return (
    <div className={`visual-guide${compact ? ' visual-guide--compact' : ''}`}>
      {leastPrecise && <span className="visual-guide__badge">Least precise</span>}
      {alternateLightOnly && (
        <p className="visual-guide__banner">Too dark — try alternate light</p>
      )}

      <div className="guide-carousel">
        <button
          type="button"
          className="guide-arrow"
          disabled={index === 0}
          onClick={() => go(-1)}
          aria-label="Previous step"
        >
          ←
        </button>
        <div className="guide-frame" aria-live="polite">
          <GuideArt art={art} className="guide-frame__img" />
        </div>
        <button
          type="button"
          className="guide-arrow"
          disabled={index >= steps.length - 1}
          onClick={() => go(1)}
          aria-label="Next step"
        >
          →
        </button>
      </div>

      <p className="visual-guide__caption">{caption}</p>

      {step.altArt && !alternateLightOnly && (
        <button
          type="button"
          className={`visual-guide__alt-toggle${useAlt ? ' is-on' : ''}`}
          onClick={() => setUseAlt((v) => !v)}
        >
          {useAlt ? 'Use phone flashlight' : step.altToggleLabel ?? 'Alternate light'}
        </button>
      )}

      <div className="guide-dots" role="tablist" aria-label="Guide steps">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`guide-dot${i === index ? ' is-active' : ''}`}
            onClick={() => {
              setIndex(i);
              setUseAlt(false);
            }}
            aria-label={`Step ${i + 1} of ${steps.length}`}
          />
        ))}
      </div>

      {alternateLightOnly && onDismissAlternate && (
        <button type="button" className="pill pill--quick" onClick={onDismissAlternate}>
          <span className="pill__title">Got it — resume</span>
        </button>
      )}
    </div>
  );
}
