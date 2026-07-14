import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, MapPin, Navigation, Route as RouteIcon, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { appointmentsForTechnician, getCustomer, getServiceType } from '@/application/repository';
import { technicians } from '@/infrastructure/seed/data';
import { fmtTime } from '@/lib/date';

/** Roteirização — sequência otimizada de visitas por técnico. */
export function RotasPage() {
  const [techId, setTechId] = useState(technicians[0].id);
  const todayIso = new Date().toISOString();
  const stops = appointmentsForTechnician(techId, todayIso);
  const tech = technicians.find((t) => t.id === techId)!;

  // Distâncias/tempos estimados entre paradas (mock — integração de rota real preparada).
  const legs = stops.map((_, i) => (i === 0 ? { km: 0, min: 0 } : { km: 3 + (i % 3) * 2.4, min: 9 + (i % 3) * 6 }));
  const totalKm = legs.reduce((s, l) => s + l.km, 0);
  const totalMin = legs.reduce((s, l) => s + l.min, 0) + stops.reduce((s, a) => s + (a.estimatedMinutes ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Roteirização"
        description="Melhor sequência de visitas, distância e tempo entre atendimentos"
        actions={<Button leftIcon={<Sparkles size={16} />}>Otimizar rota</Button>}
      />

      <div className="mb-4 flex items-center gap-2">
        <select value={techId} onChange={(e) => setTechId(e.target.value)} className="h-9 rounded-lg border border-input bg-surface px-3 text-sm">
          {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard icon="MapPin" label="Paradas" value={`${stops.length}`} />
        <MetricCard icon="Route" label="Distância total" value={`${totalKm.toFixed(1)} km`} />
        <MetricCard icon="Clock" label="Tempo estimado" value={`${Math.floor(totalMin / 60)}h${totalMin % 60}`} />
        <MetricCard icon="Fuel" label="Consumo est." value={`${(totalKm / 10).toFixed(1)} L`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`Rota de ${tech.name}`} subtitle="Sequência otimizada por proximidade" action={<Badge tone="success" dot>Otimizada</Badge>} />
          <CardBody>
            <div className="relative pl-2">
              {stops.map((a, i) => {
                const cust = getCustomer(a.customerId);
                const st = getServiceType(a.serviceTypeId);
                return (
                  <div key={a.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* linha do tempo */}
                    {i < stops.length - 1 && <span className="absolute left-[15px] top-8 h-full w-px bg-border" />}
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
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{st?.name}</span>
                        <span>· {a.estimatedMinutes}min atend.</span>
                        {i > 0 && <span className="flex items-center gap-1 text-brand"><Navigation size={11} />{legs[i].km.toFixed(1)}km · {legs[i].min}min</span>}
                      </div>
                    </motion.div>
                  </div>
                );
              })}
              {stops.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sem visitas para hoje.</p>}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Mapa da rota" subtitle="Integração Google Maps / Waze" />
          <CardBody>
            <div className="dot-grid relative h-72 overflow-hidden rounded-xl bg-muted/30">
              {stops.map((a, i) => (
                <span key={a.id} className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-foreground shadow-elevated ring-2 ring-surface" style={{ top: `${15 + i * 16}%`, left: `${20 + (i % 3) * 25}%` }}>{i + 1}</span>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm">Maps</Button>
              <Button variant="outline" size="sm">Waze</Button>
              <Button variant="outline" size="sm">Apple</Button>
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
