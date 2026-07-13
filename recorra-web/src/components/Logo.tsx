export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <rect width="120" height="120" rx="28" fill="#0E7C7B" />
      <path d="M 54 27 A 34 34 0 1 1 70 28" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      <path d="M 66 20 L 84 14 L 78 32 Z" fill="#fff" />
      <circle cx="60" cy="60" r="8" fill="#3AA8A6" />
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-xl font-semibold tracking-tight text-ink">Recorra</span>
    </div>
  );
}
