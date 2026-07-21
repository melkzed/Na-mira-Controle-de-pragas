/**
 * Utilitários de geolocalização para o mapa de rotas.
 * Projeção equiretangular simples (adequada para escala urbana), com correção
 * de longitude por cos(latitude) para manter as proporções corretas.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ProjectedPoint extends GeoPoint {
  /** Coordenada X no viewBox do SVG. */
  x: number;
  /** Coordenada Y no viewBox do SVG (invertida — norte para cima). */
  y: number;
}

/**
 * Projeta uma lista de coordenadas para o espaço do SVG (0..width, 0..height),
 * ajustando ao bounding box com uma margem. Lida com ponto único / colinear.
 */
export function projectPoints<T extends GeoPoint>(
  points: T[],
  width: number,
  height: number,
  pad = 28,
): (T & ProjectedPoint)[] {
  if (points.length === 0) return [];

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const meanLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((meanLat * Math.PI) / 180);

  const xs = lngs.map((l) => l * k);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const spanX = maxX - minX || 1e-6;
  const spanY = maxLat - minLat || 1e-6;

  // Mantém a proporção geográfica dentro do quadro disponível.
  const availW = width - pad * 2;
  const availH = height - pad * 2;
  const scale = Math.min(availW / spanX, availH / spanY);
  const offsetX = pad + (availW - spanX * scale) / 2;
  const offsetY = pad + (availH - spanY * scale) / 2;

  return points.map((p) => {
    const x = offsetX + (p.lat === undefined ? 0 : (p.lng * k - minX) * scale);
    // Latitude maior → mais ao norte → menor Y.
    const y = offsetY + (maxLat - p.lat) * scale;
    return { ...p, x, y };
  });
}

/** Link de navegação (rota com várias paradas) no Google Maps. */
export function googleMapsRoute(stops: GeoPoint[]): string {
  if (stops.length === 0) return 'https://www.google.com/maps';
  if (stops.length === 1) {
    const s = stops[0];
    return `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
  }
  const dest = stops[stops.length - 1];
  const origin = stops[0];
  const waypoints = stops
    .slice(1, -1)
    .map((s) => `${s.lat},${s.lng}`)
    .join('|');
  const base = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving`;
  return waypoints ? `${base}&waypoints=${encodeURIComponent(waypoints)}` : base;
}

/** Link do Waze para um destino (o Waze não suporta múltiplas paradas por URL). */
export function wazeLink(point: GeoPoint): string {
  return `https://waze.com/ul?ll=${point.lat},${point.lng}&navigate=yes`;
}

/** Link do Apple Maps para um destino. */
export function appleMapsLink(point: GeoPoint): string {
  return `https://maps.apple.com/?daddr=${point.lat},${point.lng}&dirflg=d`;
}
