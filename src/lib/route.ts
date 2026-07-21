/**
 * Roteirização com janelas de horário (TSP com time windows, escala do dia).
 * Minimiza o deslocamento entre os clientes respeitando:
 *  - visitas com hora marcada (janela [windowStart, windowEnd]) — não podem
 *    ser atendidas fora da janela;
 *  - visitas já realizadas / em andamento (locked) — mantêm a posição inicial.
 * Como o número de paradas por dia é pequeno, faz busca exaustiva das
 * permutações pendentes (≤ 8) e cai para uma heurística por horário acima disso.
 */
import { haversineKm, type GeoPoint } from './geo';

/** Velocidade média urbana estimada (km/h). */
export const AVG_SPEED_KMH = 22;

/** Minutos desde 00:00 (hora local) de uma data ISO. */
export function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Formata minutos-do-dia como HH:MM. */
export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export interface TimedStop extends GeoPoint {
  /** Duração do atendimento em minutos. */
  serviceMin: number;
  /** Início da janela (min do dia) — apenas para hora marcada. */
  windowStart?: number;
  /** Fim da janela (min do dia) — atender depois disso viola a janela. */
  windowEnd?: number;
  /** Já realizada / em andamento: mantém a posição na ordem original. */
  locked?: boolean;
}

export interface RouteSim {
  distanceKm: number;
  /** Km percorridos até cada parada (alinhado à ordem; posição 0 = 0). */
  legKm: number[];
  /** Minuto do dia em que o atendimento começa em cada parada (alinhado à ordem). */
  startMin: number[];
  /** Parada atendida fora da janela (alinhado à ordem). */
  late: boolean[];
  /** Nenhuma janela violada. */
  feasible: boolean;
}

export interface RoutePlan extends RouteSim {
  /** Ordem de visita (índices de `stops`). */
  order: number[];
}

const travelMin = (a: GeoPoint, b: GeoPoint) => (haversineKm(a, b) / AVG_SPEED_KMH) * 60;

function dayStartOf(stops: TimedStop[]): number {
  const starts = stops.map((s) => s.windowStart).filter((x): x is number => x != null);
  return starts.length ? Math.min(...starts) : 8 * 60;
}

/** Simula um percurso na ordem dada, calculando distância, horários e atrasos. */
export function simulateRoute(stops: TimedStop[], order: number[], dayStart = dayStartOf(stops)): RouteSim {
  let t = dayStart;
  let dist = 0;
  const legKm: number[] = [];
  const startMin: number[] = [];
  const late: boolean[] = [];
  for (let k = 0; k < order.length; k++) {
    const s = stops[order[k]];
    let km = 0;
    if (k > 0) {
      km = haversineKm(stops[order[k - 1]], s);
      t += travelMin(stops[order[k - 1]], s);
    }
    legKm.push(km);
    dist += km;
    const start = s.windowStart != null ? Math.max(t, s.windowStart) : t;
    startMin.push(start);
    late.push(s.windowEnd != null && start > s.windowEnd + 1e-6);
    t = start + s.serviceMin;
  }
  return { distanceKm: dist, legKm, startMin, late, feasible: !late.some(Boolean) };
}

/** Heap's algorithm — todas as permutações de um vetor pequeno. */
function permutations(arr: number[]): number[][] {
  const res: number[][] = [];
  const a = arr.slice();
  const c = new Array(a.length).fill(0);
  res.push(a.slice());
  let i = 0;
  while (i < a.length) {
    if (c[i] < i) {
      const k = i % 2 === 0 ? 0 : c[i];
      [a[k], a[i]] = [a[i], a[k]];
      res.push(a.slice());
      c[i] += 1;
      i = 0;
    } else {
      c[i] = 0;
      i += 1;
    }
  }
  return res;
}

/**
 * Melhor ordem de visita respeitando janelas e paradas travadas.
 * Critério: primeiro menos violações de janela, depois menor distância.
 */
export function planRoute(stops: TimedStop[], dayStart = dayStartOf(stops)): RoutePlan {
  const lockedIdx: number[] = [];
  const pendingIdx: number[] = [];
  stops.forEach((s, i) => (s.locked ? lockedIdx : pendingIdx).push(i));

  let bestOrder: number[] | null = null;
  let bestScore: [number, number] | null = null; // [atrasos, distância]

  const consider = (pendingOrder: number[]) => {
    const order = [...lockedIdx, ...pendingOrder];
    const sim = simulateRoute(stops, order, dayStart);
    const score: [number, number] = [sim.late.filter(Boolean).length, sim.distanceKm];
    if (!bestScore || score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
      bestScore = score;
      bestOrder = order;
    }
  };

  if (pendingIdx.length <= 8) {
    for (const perm of permutations(pendingIdx)) consider(perm);
  } else {
    // Dias muito longos: prioriza por horário de janela (seguro, respeita hora marcada).
    const byWindow = pendingIdx.slice().sort((a, b) => (stops[a].windowStart ?? 1e9) - (stops[b].windowStart ?? 1e9));
    consider(byWindow);
  }

  const order = bestOrder ?? stops.map((_, i) => i);
  return { order, ...simulateRoute(stops, order, dayStart) };
}
