import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Clock, Lock, MapPin, Navigation, Route as RouteIcon, Sparkles, TriangleAlert } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { RouteMap, type RouteStop } from '../components/RouteMap';
import { appointmentsForTechnician, getCustomer, getServiceType } from '@/application/repository';
import { useUsersStore } from '@/store/entityStores';
import { fmtTime } from '@/lib/date';
import { appleMapsLink, googleMapsRoute, wazeLink } from '@/lib/geo';
import { AVG_SPEED_KMH, fmtMinutes, minutesOfDay, planRoute, simulateRoute, type TimedStop } from '@/lib/route';
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

/** Roteirização — melhor sequência respeitando janelas de horário (hora marcada). */
export function RotasPage() {
  const technicians = useUsersStore((s) => s.items.filter((u) => u.role === 'tecnico' && u.isActive));
  const [techId, setTechId] = useState('');
  const [optimized, setOptimized] = useState(true);
  const todayIso = new Date().toISOString();
  const effectiveTechId = techId || technicians[0]?.id || '';
  const tech = technicians.find((t) => t.id === effectiveTechId);

  const { orderedGeo, sim, savedKm, totalKm, totalMin, lateCount } = useMemo(() => {
    const scheduled = effectiveTechId ? appointmentsForTechnician(effectiveTechId, todayIso) : [];
    const withGeo = scheduled.filter(hasGeo);
    const timed = withGeo.map(toTimed);
    const dayStart = withGeo.length ? minutesOfDay(withGeo[0].scheduledStart) : 8 * 60;
    const identity = timed.map((_, i) => i);
    const scheduledSim = simulateRoute(timed, identity, dayStart);
    const plan = planRoute(timed, dayStart);
    const activeOrder = optimized ? plan.order : identity;
    const activeSim = optimized ? plan : scheduledSim;
    const serviceMin = timed.reduce((s, t) => s + t.serviceMin, 0);
    return {
      orderedGeo: activeOrder.map((i) => withGeo[i]),
      sim: activeSim,
      savedKm: scheduledSim.distanceKm - plan.distanceKm,
      totalKm: activeSim.distanceKm,
      totalMin: Math.round((activeSim.distanceKm / AVG_SPEED_KMH) * 60 + serviceMin),
      lateCount: activeSim.late.filter(Boolean).length,
    };
  }, [effectiveTechId, todayIso, optimized]);

  const mapStops: RouteStop[] = orderedGeo.map((a) => ({
    id: a.id,
    label: getCustomer(a.customerId)?.name ?? 'Cliente',
    lat: a.latitude!,
    lng: a.longitude!,
    color: getServiceType(a.serviceTypeId)?.color,
    done: a.status === 'finalizado',
    sub: fmtTime(a.scheduledStart),
  }));
  const routePoints = orderedGeo.map((a) => ({ lat: a.latitude!, lng: a.longitude! }));
  const openRoute = (url: string) => window.open(url, '_blank', 'noopener');
  const canOptimize = orderedGeo.length >= 3;

  return (
    <div>
      <PageHeader
        title="Roteirização"
        description="Melhor sequência de visitas respeitando os horários marcados"
        actions={
          <Button
            variant={optimized ? 'outline' : 'primary'}
            leftIcon={optimized ? <CalendarClock size={16} /> : <Sparkles size={16} />}
            onClick={() => setOptimized((v) => !v)}
          >
            {optimized ? 'Ver ordem agendada' : 'Otimizar rota'}
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <select value={techId} onChange={(e) => setTechId(e.target.value)} className="h-9 rounded-lg border border-input bg-surface px-3 text-sm">
          {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard icon="MapPin" label="Paradas" value={`${orderedGeo.length}`} />
        <MetricCard icon="Route" label="Distância total" value={`${totalKm.toFixed(1)} km`} />
        <MetricCard icon="Clock" label="Tempo estimado" value={`${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, '0')}`} />
        <MetricCard icon="Fuel" label="Consumo est." value={`${(totalKm / 10).toFixed(1)} L`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`Rota de ${tech?.name ?? '—'}`}
            subtitle={optimized ? 'Menor deslocamento respeitando hora marcada' : 'Na ordem dos horários agendados'}
            action={
              optimized
                ? (lateCount > 0
                    ? <Badge tone="danger" dot>{lateCount} fora da janela</Badge>
                    : <Badge tone="success" dot>{canOptimize && savedKm > 0.05 ? `Otimizada · −${savedKm.toFixed(1)} km` : 'Otimizada'}</Badge>)
                : <Badge tone="neutral" dot>Agendada</Badge>
            }
          />
          <CardBody>
            {optimized && canOptimize && (
              <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Sparkles size={13} className="mt-0.5 shrink-0 text-brand" />
                Mantém as visitas com <Lock size={11} className="inline" /> hora marcada dentro do horário e as visitas em andamento na frente; otimiza o restante pelo menor trajeto.
              </p>
            )}
            <div className="relative pl-2">
              {orderedGeo.map((a, i) => {
                const cust = getCustomer(a.customerId);
                const st = getServiceType(a.serviceTypeId);
                const late = sim.late[i];
                return (
                  <div key={a.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* linha do tempo */}
                    {i < orderedGeo.length - 1 && <span className="absolute left-[15px] top-8 h-full w-px bg-border" />}
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.08, type: 'spring' }} className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-soft" style={{ background: st?.color }}>
                      {i + 1}
                    </motion.div>
                    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className={`flex-1 rounded-xl border p-3 ${late ? 'border-danger/40 bg-danger-soft/30' : 'border-border'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{cust?.name}</p>
                          <p className="truncate text-xs text-muted-foreground"><MapPin size={11} className="mr-1 inline" />{a.address}</p>
                        </div>
                        {a.fixedTime
                          ? <Badge tone={late ? 'danger' : 'brand'}><Lock size={10} className="mr-1" />{fmtTime(a.scheduledStart)}</Badge>
                          : <Badge tone="neutral">{fmtTime(a.scheduledStart)}</Badge>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{st?.name}</span>
                        <span>· {a.estimatedMinutes}min atend.</span>
                        {i > 0 && sim.legKm[i] > 0 && <span className="flex items-center gap-1 text-brand"><Navigation size={11} />{sim.legKm[i].toFixed(1)} km · {Math.round((sim.legKm[i] / AVG_SPEED_KMH) * 60)} min</span>}
                        {optimized && <span>· início ~{fmtMinutes(sim.startMin[i])}</span>}
                        {late && <span className="flex items-center gap-1 font-medium text-danger"><TriangleAlert size={11} />fora da janela</span>}
                      </div>
                    </motion.div>
                  </div>
                );
              })}
              {orderedGeo.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sem visitas para hoje.</p>}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Mapa da rota" subtitle={optimized ? 'Melhor trajeto · abrir no navegador de mapas' : 'Coordenadas reais · abrir no navegador de mapas'} />
          <CardBody>
            <RouteMap stops={mapStops} height={288} />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" disabled={routePoints.length === 0} onClick={() => openRoute(googleMapsRoute(routePoints))}>Maps</Button>
              <Button variant="outline" size="sm" disabled={routePoints.length === 0} onClick={() => openRoute(wazeLink(routePoints[routePoints.length - 1]))}>Waze</Button>
              <Button variant="outline" size="sm" disabled={routePoints.length === 0} onClick={() => openRoute(appleMapsLink(routePoints[routePoints.length - 1]))}>Apple</Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  const Icons: Record<string, React.ReactNode> = {
    MapPin: <MapPin size={18} />, Route: <RouteIcon size={18} />, Clock: <Clock size={18} />, Fuel: <Navigation size={18} />,
  };
  return (
    <Card className="p-4">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">{Icons[icon]}</div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}
