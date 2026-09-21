export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}figma/logo-clean.png`}
      alt="Pulse"
      className={`brand-mark ${className}`.trim()}
      width={99}
      height={99}
      draggable={false}
    />
  );
}
