import { useId, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { projectPoints } from '@/lib/geo';
import { cn } from '@/lib/utils';

export interface RouteStop {
  id: string;
  label: string;
  lat: number;
  lng: number;
  /** Cor do marcador (por tipo de serviço). */
  color?: string;
  /** Marca a parada como concluída. */
  done?: boolean;
  /** Texto auxiliar (horário, cliente…), exibido no title/tooltip. */
  sub?: string;
}

/**
 * Mapa de rota renderizado em SVG a partir de coordenadas reais (lat/lng).
 * Autossuficiente — sem dependência de tiles externos, funciona offline e
 * respeita o CSP. Desenha o traçado na ordem das paradas e marcadores
 * numerados. Norte é para cima.
 */
export function RouteMap({
  stops,
  height = 320,
  showRoute = true,
  className,
}: {
  stops: RouteStop[];
  height?: number;
  showRoute?: boolean;
  className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const W = 640;
  const H = height;

  const projected = useMemo(() => projectPoints(stops, W, H, 40), [stops, H]);
  const path = useMemo(
    () => projected.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
    [projected],
  );

  if (stops.length === 0) {
    return (
      <div
        className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-muted-foreground', className)}
        style={{ height }}
      >
        <MapPin size={22} className="mb-1.5 opacity-60" />
        <p className="text-sm">Sem paradas para exibir no mapa.</p>
      </div>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} role="img" aria-label={`Mapa da rota com ${stops.length} paradas`} className="block">
        <defs>
          <linearGradient id={`bg-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--color-muted))" stopOpacity="0.5" />
            <stop offset="100%" stopColor="rgb(var(--color-muted))" stopOpacity="0.15" />
          </linearGradient>
          <pattern id={`grid-${gid}`} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0 L0 0 0 40" fill="none" stroke="rgb(var(--color-border))" strokeWidth="1" strokeOpacity="0.5" />
          </pattern>
        </defs>

        {/* Fundo estilo mapa */}
        <rect width={W} height={H} fill={`url(#bg-${gid})`} />
        <rect width={W} height={H} fill={`url(#grid-${gid})`} />

        {/* Traçado da rota */}
        {showRoute && projected.length > 1 && (
          <>
            <path d={path} fill="none" stroke="rgb(var(--color-brand))" strokeOpacity="0.25" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <motion.path
              d={path}
              fill="none"
              stroke="rgb(var(--color-brand))"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6 7"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, ease: 'easeInOut' }}
            />
          </>
        )}

        {/* Marcadores */}
        {projected.map((p, i) => (
          <motion.g
            key={p.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 260, damping: 18 }}
            style={{ transformOrigin: `${p.x}px ${p.y}px` }}
          >
            <title>{`${i + 1}. ${p.label}${p.sub ? ` — ${p.sub}` : ''}`}</title>
            <circle cx={p.x} cy={p.y} r="14" fill="rgb(var(--color-surface))" stroke={p.color ?? 'rgb(var(--color-brand))'} strokeWidth="2.5" opacity={p.done ? 0.6 : 1} />
            <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="700" fill={p.color ?? 'rgb(var(--color-brand))'} opacity={p.done ? 0.6 : 1}>
              {i + 1}
            </text>
          </motion.g>
        ))}
      </svg>
    </div>
  );
}
