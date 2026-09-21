export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="close-x" onClick={onClick} aria-label={label}>
      +
    </button>
  );
}
