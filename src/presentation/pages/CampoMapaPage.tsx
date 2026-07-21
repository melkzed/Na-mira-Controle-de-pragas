import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, MapPin, Navigation, Sparkles } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { RouteMap, type RouteStop } from '../components/RouteMap';
import { PreviewBanner, useFieldTech } from '../components/field/FieldTech';
import { appointmentsForTechnician, getCustomer, getServiceType } from '@/application/repository';
import { googleMapsRoute, optimizeOrder, routeDistanceKm, wazeLink } from '@/lib/geo';
import { fmtTime } from '@/lib/date';
import { cn } from '@/lib/utils';

const hasGeo = (a: { latitude?: number; longitude?: number }) => a.latitude != null && a.longitude != null;

/** Mapa da rota do dia para o técnico — melhor sequência e navegação externa. */
export function CampoMapaPage() {
  const { techId } = useFieldTech();
  const [optimized, setOptimized] = useState(true);
  const todayIso = new Date().toISOString();
  const appts = useMemo(() => appointmentsForTechnician(techId, todayIso), [techId, todayIso]);

  const { orderedAppts, orderedGeo, totalKm } = useMemo(() => {
    const withGeo = appts.filter(hasGeo);
    const withoutGeo = appts.filter((a) => !hasGeo(a));
    const pts = withGeo.map((a) => ({ lat: a.latitude!, lng: a.longitude! }));
    const optIdx = optimizeOrder(pts, 0);
    const geo = optimized ? optIdx.map((i) => withGeo[i]) : withGeo;
    return {
      orderedAppts: [...geo, ...withoutGeo],
      orderedGeo: geo,
      totalKm: routeDistanceKm(geo.map((a) => ({ lat: a.latitude!, lng: a.longitude! }))),
    };
  }, [appts, optimized]);

  const stops: RouteStop[] = orderedGeo.map((a) => ({
    id: a.id,
    label: getCustomer(a.customerId)?.name ?? 'Cliente',
    lat: a.latitude!,
    lng: a.longitude!,
    color: getServiceType(a.serviceTypeId)?.color,
    done: a.status === 'finalizado',
    sub: fmtTime(a.scheduledStart),
  }));
  const routePoints = orderedGeo.map((a) => ({ lat: a.latitude!, lng: a.longitude! }));
  const canOptimize = orderedGeo.length >= 3;

  return (
    <div className="mx-auto max-w-md">
      <PreviewBanner />

      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-base font-bold text-foreground">Mapa da rota</p>
          <p className="text-xs text-muted-foreground">{orderedGeo.length} parada(s) · {totalKm.toFixed(1)} km</p>
        </div>
        {routePoints.length > 0 && (
          <Button size="sm" leftIcon={<Navigation size={15} />} onClick={() => window.open(googleMapsRoute(routePoints), '_blank', 'noopener')}>
            Navegar
          </Button>
        )}
      </div>

      {canOptimize && (
        <button
          onClick={() => setOptimized((v) => !v)}
          className={cn(
            'mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
            optimized ? 'border-brand/40 bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          <Sparkles size={13} /> {optimized ? 'Rota otimizada (menor trajeto)' : 'Ordem agendada'}
        </button>
      )}

      <RouteMap stops={stops} height={300} />

      <div className="mt-4 space-y-2">
        {orderedAppts.map((a, i) => {
          const cust = getCustomer(a.customerId);
          const st = getServiceType(a.serviceTypeId);
          return (
            <Card key={a.id} className="p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: st?.color ?? 'rgb(var(--color-brand))' }}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{cust?.name}</p>
                  <p className="truncate text-xs text-muted-foreground"><Clock size={11} className="mr-1 inline" />{fmtTime(a.scheduledStart)} · {a.address ?? st?.name}</p>
                </div>
                {a.status === 'finalizado' ? (
                  <CheckCircle2 size={18} className="shrink-0 text-success" />
                ) : hasGeo(a) ? (
                  <button
                    onClick={() => window.open(wazeLink({ lat: a.latitude!, lng: a.longitude! }), '_blank', 'noopener')}
                    aria-label={`Navegar até ${cust?.name}`}
                    className="shrink-0 rounded-lg border border-border p-1.5 text-brand transition hover:bg-brand-soft"
                    title="Navegar (Waze)"
                  >
                    <Navigation size={15} />
                  </button>
                ) : (
                  <Badge tone="neutral"><MapPin size={11} className="mr-1" />sem GPS</Badge>
                )}
              </div>
            </Card>
          );
        })}
        {appts.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma visita agendada para hoje.</p>}
      </div>
    </div>
  );
}
