import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Lock, MapPin, Navigation, Sparkles, TriangleAlert } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { RouteMap, type RouteStop } from '../components/RouteMap';
import { PreviewBanner, useFieldTech } from '../components/field/FieldTech';
import { releasedAppointmentsForTechnician, getCustomer, getServiceType } from '@/application/repository';
import { googleMapsRoute, wazeLink } from '@/lib/geo';
import { fmtMinutes, minutesOfDay, planRoute, simulateRoute, type TimedStop } from '@/lib/route';
import { fmtTime } from '@/lib/date';
import { cn } from '@/lib/utils';
import type { Appointment } from '@/domain/types';

const hasGeo = (a: { latitude?: number; longitude?: number }) => a.latitude != null && a.longitude != null;
const isLocked = (a: Appointment) => a.status === 'finalizado' || a.status === 'em_atendimento' || a.status === 'em_deslocamento';

const toTimed = (a: Appointment): TimedStop => ({
  lat: a.latitude!,
  lng: a.longitude!,
  serviceMin: a.estimatedMinutes ?? 60,
  windowStart: a.fixedTime ? minutesOfDay(a.scheduledStart) : undefined,
  windowEnd: a.fixedTime ? minutesOfDay(a.scheduledEnd) : undefined,
  locked: isLocked(a),
});

/** Mapa da rota do dia — melhor sequência respeitando hora marcada. */
export function CampoMapaPage() {
  const { techId } = useFieldTech();
  const [optimized, setOptimized] = useState(true);
  const todayIso = new Date().toISOString();
  const appts = useMemo(() => releasedAppointmentsForTechnician(techId, todayIso), [techId, todayIso]);

  const { orderedGeo, sim, totalKm, lateCount } = useMemo(() => {
    const withGeo = appts.filter(hasGeo);
    const timed = withGeo.map(toTimed);
    const dayStart = withGeo.length ? minutesOfDay(withGeo[0].scheduledStart) : 8 * 60;
    const identity = timed.map((_, i) => i);
    const plan = planRoute(timed, dayStart);
    const activeOrder = optimized ? plan.order : identity;
    const activeSim = optimized ? plan : simulateRoute(timed, identity, dayStart);
    return {
      orderedGeo: activeOrder.map((i) => withGeo[i]),
      sim: activeSim,
      totalKm: activeSim.distanceKm,
      lateCount: activeSim.late.filter(Boolean).length,
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setOptimized((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
              optimized ? 'border-brand/40 bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            <Sparkles size={13} /> {optimized ? 'Rota otimizada (hora marcada respeitada)' : 'Ordem agendada'}
          </button>
          {optimized && lateCount > 0 && (
            <Badge tone="danger"><TriangleAlert size={11} className="mr-1" />{lateCount} fora da janela</Badge>
          )}
        </div>
      )}

      <RouteMap stops={stops} height={300} />

      <div className="mt-4 space-y-2">
        {orderedGeo.map((a, i) => {
          const cust = getCustomer(a.customerId);
          const st = getServiceType(a.serviceTypeId);
          const late = sim.late[i];
          return (
            <Card key={a.id} className={cn('p-3', late && 'border-danger/40 bg-danger-soft/20')}>
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: st?.color ?? 'rgb(var(--color-brand))' }}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-foreground">{cust?.name}</p>
                    {a.fixedTime && <Lock size={11} className={late ? 'shrink-0 text-danger' : 'shrink-0 text-brand'} />}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    <Clock size={11} className="mr-1 inline" />{fmtTime(a.scheduledStart)}
                    {optimized && <> · início ~{fmtMinutes(sim.startMin[i])}</>}
                    {late && <span className="ml-1 font-medium text-danger">· fora da janela</span>}
                  </p>
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
