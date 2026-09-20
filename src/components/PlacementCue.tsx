import { GuideArt, METHOD_VISUAL_STEPS } from '../guides/GuideArt';
import type { MethodId } from '../types';

/** Single sticky placement illustration during non-camera measurement. */
export function PlacementCue({ methodId }: { methodId: MethodId }) {
  const steps = METHOD_VISUAL_STEPS[methodId];
  // Prefer the "placement" step (usually middle / second)
  const step = steps[Math.min(1, steps.length - 1)] ?? steps[0];
  if (!step) return null;
  return (
    <div className="placement-cue" aria-hidden>
      <GuideArt art={step.art} className="placement-cue__art" />
    </div>
  );
}
