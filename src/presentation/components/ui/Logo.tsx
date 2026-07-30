/**
 * Marca "Gestão Dedetizadora" — escudo/hexágono com besouro estilizado e nós de
 * circuito (identidade visual: controle inteligente de pragas). SVG puro,
 * sem dependências externas, para reaproveitar em qualquer superfície
 * (sidebar, login, PDFs impressos).
 */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Escudo hexagonal */}
      <path d="M32 4 L54 16.5 V43.5 L32 60 L10 43.5 V16.5 Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      {/* Nós de circuito */}
      <circle cx="23" cy="7.5" r="2.4" stroke="currentColor" strokeWidth="2" />
      <circle cx="41" cy="7.5" r="2.4" stroke="currentColor" strokeWidth="2" />
      <path d="M23 9.9 V15.5 M41 9.9 V15.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="55.5" cy="27" r="2.4" stroke="currentColor" strokeWidth="2" />
      <path d="M53.3 26 L47 23" stroke="currentColor" strokeWidth="2" />
      {/* Besouro */}
      <g fill="currentColor">
        <ellipse cx="32" cy="35" rx="9.5" ry="12.5" />
        <path d="M26.5 24 Q24 19.5 19.5 18.5" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M37.5 24 Q40 19.5 44.5 18.5" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M23 28 L14 25 M22.5 35 L12.5 35 M23 42 L15 46" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M41 28 L50 25 M41.5 35 L51.5 35 M41 42 L49 46" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </g>
      <path d="M32 24 V47" stroke="rgb(var(--color-surface))" strokeWidth="1.6" />
    </svg>
  );
}

/** Lockup completo (ícone + "GESTÃO DEDETIZADORA"), com tagline opcional. */
export function LogoLockup({
  iconSize = 40,
  tagline = false,
  className,
}: {
  iconSize?: number;
  tagline?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <LogoMark size={iconSize} className="shrink-0 text-brand" />
      <div className="leading-tight">
        <p className="text-base font-extrabold tracking-tight text-foreground">GESTÃO</p>
        <p className="-mt-0.5 text-sm font-bold tracking-tight text-foreground">DEDETIZADORA</p>
        {tagline && <p className="mt-1 text-xs text-muted-foreground">O controle inteligente das suas operações.</p>}
      </div>
    </div>
  );
}
