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

/** Distância em km entre dois pontos (fórmula de Haversine). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Comprimento total (km) de um trajeto aberto percorrido na ordem dada. */
export function routeDistanceKm(points: GeoPoint[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversineKm(points[i - 1], points[i]);
  return sum;
}

/**
 * Melhor sequência de visitas (menor distância total).
 * Heurística nearest-neighbor a partir de `startIndex`, refinada com 2-opt.
 * Trajeto aberto (não retorna à origem) e com a primeira parada fixa — o
 * técnico começa pelo primeiro compromisso do dia e segue pelo caminho mais
 * curto entre os demais. Retorna a ordem de visita como índices de `points`.
 */
export function optimizeOrder(points: GeoPoint[], startIndex = 0): number[] {
  const n = points.length;
  if (n <= 2) return points.map((_, i) => i);

  // Nearest-neighbor.
  const visited = new Array(n).fill(false);
  const order = [startIndex];
  visited[startIndex] = true;
  for (let step = 1; step < n; step++) {
    const last = order[order.length - 1];
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const d = haversineKm(points[last], points[j]);
      if (d < bestD) { bestD = d; best = j; }
    }
    order.push(best);
    visited[best] = true;
  }

  // 2-opt: inverte trechos enquanto reduzir a distância (mantém a origem fixa).
  const len = (o: number[]) => routeDistanceKm(o.map((i) => points[i]));
  let bestOrder = order;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < bestOrder.length - 1; i++) {
      for (let j = i + 1; j < bestOrder.length; j++) {
        const candidate = [
          ...bestOrder.slice(0, i),
          ...bestOrder.slice(i, j + 1).reverse(),
          ...bestOrder.slice(j + 1),
        ];
        if (len(candidate) + 1e-9 < len(bestOrder)) {
          bestOrder = candidate;
          improved = true;
        }
      }
    }
  }
  return bestOrder;
}

/** Link de navegação (rota com várias paradas) no Google Maps. */
export function googleMapsRoute(stops: GeoPoint[]): string {
  if (stops.length === 0) return 'https://www.google.com/maps';
  if (stops.length === 1) {
    // Sem origem: o app/site do Google Maps usa a localização atual do
    // dispositivo automaticamente — não depende da geolocalização do navegador
    // (mais confiável que exigir permissão de GPS na própria página).
    const s = stops[0];
    return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=driving`;
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

/** Link de navegação (Google Maps) até um destino descrito por ENDEREÇO em
 *  texto — usado quando o cliente ainda não tem latitude/longitude
 *  cadastradas com precisão. O próprio Google Maps geocodifica o endereço ao
 *  abrir no celular do técnico; não depende de nenhum serviço de
 *  geocodificação próprio nem de API paga. */
export function googleMapsRouteToAddress(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
}

/** Link do Google Maps que **mostra** um endereço (pino no mapa), em vez de
 *  traçar rota. É o que serve no escritório: ver onde fica o cliente. Para o
 *  técnico em campo, que quer chegar lá, use `googleMapsRouteToAddress`. */
export function googleMapsAddressUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Formata o endereço de um cliente para exibição/uso em links de navegação. */
export function formatAddress(c: { street?: string; number?: string; district?: string; city?: string; state?: string }): string {
  return [c.street && `${c.street}, ${c.number ?? 's/n'}`, c.district, c.city && `${c.city}/${c.state ?? ''}`]
    .filter(Boolean)
    .join(' — ');
}
