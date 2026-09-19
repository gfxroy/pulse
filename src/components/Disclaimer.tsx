interface Props {
  compact?: boolean;
}

export function Disclaimer({ compact }: Props) {
  if (compact) {
    return (
      <p className="disclaimer disclaimer--compact" role="note">
        Wellness estimate only — not a medical device. Not for diagnosis or treatment.
      </p>
    );
  }
  return (
    <aside className="disclaimer" role="note">
      <strong>Not a medical device.</strong> This app provides a wellness heart-rate{' '}
      <em>estimate</em> using phone sensors. It is not intended to diagnose, treat, cure, or
      prevent any disease. Do not rely on it for clinical decisions. If you have health
      concerns, consult a qualified professional.
    </aside>
  );
}
