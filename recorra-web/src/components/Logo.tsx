/* eslint-disable @next/next/no-img-element */
// Artes oficiais do kit de marca (public/README.txt). São SVG com o texto já em
// contornos, então não dependem da fonte Unbounded estar carregada.

/** Proporção da logo horizontal (viewBox 696.2 x 119.5). */
const RATIO = 696.2 / 119.5;

/** Símbolo sozinho: quadrado teal com o sino. Bom para avatar e espaço curto. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return <img src="/recorrai-icon.svg" alt="" aria-hidden="true" width={size} height={size} className="shrink-0" />;
}

/**
 * Logo completa (símbolo + "Recorrai").
 * `size` é a ALTURA; a largura acompanha a proporção (~5.8x).
 * Use `variant="white"` sobre fundo escuro.
 */
export function Logo({ size = 32, variant = 'color' }: { size?: number; variant?: 'color' | 'white' }) {
  const src = variant === 'white' ? '/recorrai-logo-horizontal-white.svg' : '/recorrai-logo-horizontal.svg';
  return <img src={src} alt="Recorrai" width={Math.round(size * RATIO)} height={size} className="shrink-0" />;
}
