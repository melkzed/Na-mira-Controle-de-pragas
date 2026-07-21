import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Clock, MapPin, Navigation, Route as RouteIcon, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { RouteMap, type RouteStop } from '../components/RouteMap';
import { appointmentsForTechnician, getCustomer, getServiceType } from '@/application/repository';
import { technicians } from '@/infrastructure/seed/data';
import { fmtTime } from '@/lib/date';
import { appleMapsLink, googleMapsRoute, haversineKm, optimizeOrder, routeDistanceKm, wazeLink } from '@/lib/geo';

/** Velocidade média urbana estimada (km/h) para converter distância em tempo. */
const AVG_SPEED_KMH = 22;
const hasGeo = (a: { latitude?: number; longitude?: number }) => a.latitude != null && a.longitude != null;

/** Roteirização — melhor sequência de visitas por técnico (menor deslocamento). */
export function RotasPage() {
  const [techId, setTechId] = useState(technicians[0].id);
  const [optimized, setOptimized] = useState(true);
  const todayIso = new Date().toISOString();
  const tech = technicians.find((t) => t.id === techId)!;
  const scheduled = appointmentsForTechnician(techId, todayIso);

  const { ordered, totalKm, savedKm } = useMemo(() => {
    const withGeo = scheduled.filter(hasGeo);
    const withoutGeo = scheduled.filter((a) => !hasGeo(a));
    const pts = withGeo.map((a) => ({ lat: a.latitude!, lng: a.longitude! }));
    const schedKm = routeDistanceKm(pts);
    const optIdx = optimizeOrder(pts, 0);
    const optKm = routeDistanceKm(optIdx.map((i) => pts[i]));
    const orderedGeo = optimized ? optIdx.map((i) => withGeo[i]) : withGeo;
    return {
      ordered: [...orderedGeo, ...withoutGeo],
      totalKm: optimized ? optKm : schedKm,
      savedKm: schedKm - optKm,
    };
  }, [scheduled, optimized]);

  const legs = ordered.map((a, i) => {
    if (i === 0 || !hasGeo(a) || !hasGeo(ordered[i - 1])) return 0;
    const prev = ordered[i - 1];
    return haversineKm({ lat: prev.latitude!, lng: prev.longitude! }, { lat: a.latitude!, lng: a.longitude! });
  });
  const driveMin = Math.round((totalKm / AVG_SPEED_KMH) * 60);
  const serviceMin = ordered.reduce((s, a) => s + (a.estimatedMinutes ?? 0), 0);
  const totalMin = driveMin + serviceMin;

  const orderedGeo = ordered.filter(hasGeo);
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
  const canOptimize = ordered.filter(hasGeo).length >= 3;

  return (
    <div>
      <PageHeader
        title="Roteirização"
        description="Melhor sequência de visitas, distância e tempo entre atendimentos"
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
        <MetricCard icon="MapPin" label="Paradas" value={`${ordered.length}`} />
        <MetricCard icon="Route" label="Distância total" value={`${totalKm.toFixed(1)} km`} />
        <MetricCard icon="Clock" label="Tempo estimado" value={`${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, '0')}`} />
        <MetricCard icon="Fuel" label="Consumo est." value={`${(totalKm / 10).toFixed(1)} L`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`Rota de ${tech.name}`}
            subtitle={optimized ? 'Melhor sequência por menor deslocamento' : 'Na ordem dos horários agendados'}
            action={
              optimized
                ? <Badge tone="success" dot>{canOptimize && savedKm > 0.05 ? `Otimizada · −${savedKm.toFixed(1)} km` : 'Otimizada'}</Badge>
                : <Badge tone="neutral" dot>Agendada</Badge>
            }
          />
          <CardBody>
            {optimized && canOptimize && (
              <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Sparkles size={13} className="mt-0.5 shrink-0 text-brand" />
                Sequência sugerida pelo menor trajeto. Ajuste a ordem manualmente se houver horários fixos com o cliente.
              </p>
            )}
            <div className="relative pl-2">
              {ordered.map((a, i) => {
                const cust = getCustomer(a.customerId);
                const st = getServiceType(a.serviceTypeId);
                return (
                  <div key={a.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* linha do tempo */}
                    {i < ordered.length - 1 && <span className="absolute left-[15px] top-8 h-full w-px bg-border" />}
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.08, type: 'spring' }} className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-soft" style={{ background: st?.color }}>
                      {i + 1}
                    </motion.div>
                    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="flex-1 rounded-xl border border-border p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{cust?.name}</p>
                          <p className="text-xs text-muted-foreground"><MapPin size={11} className="mr-1 inline" />{a.address}</p>
                        </div>
                        <Badge tone="neutral">{fmtTime(a.scheduledStart)}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{st?.name}</span>
                        <span>· {a.estimatedMinutes}min atend.</span>
                        {i > 0 && legs[i] > 0 && <span className="flex items-center gap-1 text-brand"><Navigation size={11} />{legs[i].toFixed(1)} km · {Math.round((legs[i] / AVG_SPEED_KMH) * 60)} min até aqui</span>}
                      </div>
                    </motion.div>
                  </div>
                );
              })}
              {ordered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sem visitas para hoje.</p>}
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
