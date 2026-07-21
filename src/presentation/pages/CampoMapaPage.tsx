import { useMemo } from 'react';
import { CheckCircle2, Clock, MapPin, Navigation } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { RouteMap, type RouteStop } from '../components/RouteMap';
import { PreviewBanner, useFieldTech } from '../components/field/FieldTech';
import { appointmentsForTechnician, getCustomer, getServiceType } from '@/application/repository';
import { googleMapsRoute, wazeLink } from '@/lib/geo';
import { fmtTime } from '@/lib/date';

/** Mapa da rota do dia para o técnico — coordenadas reais e navegação externa. */
export function CampoMapaPage() {
  const { techId } = useFieldTech();
  const todayIso = new Date().toISOString();
  const appts = useMemo(() => appointmentsForTechnician(techId, todayIso), [techId, todayIso]);

  const geoStops = appts.filter((a) => a.latitude != null && a.longitude != null);
  const stops: RouteStop[] = geoStops.map((a) => {
    const st = getServiceType(a.serviceTypeId);
    const cust = getCustomer(a.customerId);
    return {
      id: a.id,
      label: cust?.name ?? 'Cliente',
      lat: a.latitude!,
      lng: a.longitude!,
      color: st?.color,
      done: a.status === 'finalizado',
      sub: fmtTime(a.scheduledStart),
    };
  });

  const routePoints = geoStops.map((a) => ({ lat: a.latitude!, lng: a.longitude! }));

  return (
    <div className="mx-auto max-w-md">
      <PreviewBanner />

      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-base font-bold text-foreground">Mapa da rota</p>
          <p className="text-xs text-muted-foreground">{stops.length} parada(s) hoje</p>
        </div>
        {routePoints.length > 0 && (
          <Button size="sm" leftIcon={<Navigation size={15} />} onClick={() => window.open(googleMapsRoute(routePoints), '_blank', 'noopener')}>
            Navegar
          </Button>
        )}
      </div>

      <RouteMap stops={stops} height={300} />

      <div className="mt-4 space-y-2">
        {appts.map((a, i) => {
          const cust = getCustomer(a.customerId);
          const st = getServiceType(a.serviceTypeId);
          const hasGeo = a.latitude != null && a.longitude != null;
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
                ) : hasGeo ? (
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
