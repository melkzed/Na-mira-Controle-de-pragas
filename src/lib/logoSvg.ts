/**
 * Marca "Gestão Dedetizadora" (escudo + besouro + nós de circuito) em SVG puro
 * — mesma marca do componente `LogoMark`, mas como string HTML para uso nos
 * documentos impressos (OS, Certificado, Laudo), que são montados fora do
 * React via `window.open` + `document.write`.
 */
export function logoSvgMarkup(size = 44, color = '#D32F2F'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M32 4 L54 16.5 V43.5 L32 60 L10 43.5 V16.5 Z" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="23" cy="7.5" r="2.4" stroke="${color}" stroke-width="2"/>
    <circle cx="41" cy="7.5" r="2.4" stroke="${color}" stroke-width="2"/>
    <path d="M23 9.9 V15.5 M41 9.9 V15.5" stroke="${color}" stroke-width="2"/>
    <circle cx="55.5" cy="27" r="2.4" stroke="${color}" stroke-width="2"/>
    <path d="M53.3 26 L47 23" stroke="${color}" stroke-width="2"/>
    <g fill="${color}">
      <ellipse cx="32" cy="35" rx="9.5" ry="12.5"/>
      <path d="M26.5 24 Q24 19.5 19.5 18.5" stroke="${color}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M37.5 24 Q40 19.5 44.5 18.5" stroke="${color}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M23 28 L14 25 M22.5 35 L12.5 35 M23 42 L15 46" stroke="${color}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      <path d="M41 28 L50 25 M41.5 35 L51.5 35 M41 42 L49 46" stroke="${color}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    </g>
    <path d="M32 24 V47" stroke="#ffffff" stroke-width="1.6"/>
  </svg>`;
}
