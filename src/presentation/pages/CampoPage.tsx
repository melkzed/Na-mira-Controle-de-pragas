import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, ChevronRight, Clock, MapPin, Navigation, Package,
  PhoneCall, Play, TriangleAlert,
} from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Progress } from '../components/ui/misc';
import { AppointmentStatusBadge, PriorityBadge } from '../components/StatusBadge';
import { appointmentsForTechnician, getCustomer, getProduct, getServiceType, technicianBalances } from '@/application/repository';
import { technicians } from '@/infrastructure/seed/data';
import { useProductsStore } from '@/store/entityStores';
import { X } from 'lucide-react';
import { Select } from '../components/ui/Field';
import type { Appointment } from '@/domain/types';
import { fmtTime } from '@/lib/date';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';

/**
 * Painel do Técnico — experiência dedicada de campo (mobile-first).
 * Usa a identidade do técnico autenticado. Sem acesso a dados administrativos:
 * apenas a própria rotina, rota e estoque. Staff pode pré-visualizar qualquer
 * técnico através do seletor.
 */
export function CampoPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const isTech = currentUser?.role === 'tecnico';
  const [previewId, setPreviewId] = useState(technicians[0].id);
  const techId = isTech && currentUser ? currentUser.id : previewId;

  const todayIso = new Date().toISOString();
  const appts = useMemo(() => appointmentsForTechnician(techId, todayIso), [techId, todayIso]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = appts.find((a) => a.id === activeId) ?? appts[0];
  const loc = `loc-${techId.replace('u-', '')}`;
  const stock = technicianBalances(loc);
  const tech = technicians.find((t) => t.id === techId) ?? { id: techId, name: currentUser?.name ?? 'Técnico' };

  const doneCount = appts.filter((a) => a.status === 'finalizado').length;

  return (
    <div className="mx-auto max-w-md">
      {/* Seletor de pré-visualização — visível apenas para gestores/staff */}
      {!isTech && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-3">
          <span className="text-xs font-medium text-muted-foreground">Pré-visualizar como:</span>
          <select
            value={previewId}
            onChange={(e) => { setPreviewId(e.target.value); setActiveId(null); }}
            className="h-8 flex-1 rounded-lg border border-input bg-surface px-2 text-sm"
          >
            {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      <div>
        {/* Cabeçalho do técnico */}
        <Card className="mb-4 overflow-hidden">
          <div className="bg-gradient-to-br from-brand to-emerald-600 p-5 text-white">
            <div className="flex items-center gap-3">
              <Avatar name={tech.name} size="lg" className="ring-white/30" />
              <div>
                <p className="text-lg font-bold">Olá, {tech.name.split(' ')[0]}</p>
                <p className="text-sm text-white/80">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <HeaderStat label="Visitas" value={appts.length} />
              <HeaderStat label="Concluídas" value={doneCount} />
              <HeaderStat label="Restantes" value={appts.length - doneCount} />
            </div>
            <div className="mt-3">
              <Progress value={appts.length ? (doneCount / appts.length) * 100 : 0} tone="success" className="bg-white/25" />
            </div>
          </div>
        </Card>

        {/* Próxima visita destacada */}
        {active && <NextVisit appt={active} />}

        {/* Rota do dia */}
        <p className="mb-2 mt-6 px-1 text-sm font-semibold text-foreground">Rota de hoje</p>
        <div className="space-y-2">
          {appts.map((a, i) => {
            const cust = getCustomer(a.customerId);
            const st = getServiceType(a.serviceTypeId);
            const isActive = a.id === active?.id;
            return (
              <motion.button
                key={a.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveId(a.id)}
                className={cn('flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition', isActive ? 'border-brand bg-brand-soft/40 shadow-soft' : 'border-border bg-surface hover:bg-muted/40')}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{cust?.name}</p>
                  <p className="truncate text-xs text-muted-foreground"><Clock size={11} className="mr-1 inline" />{fmtTime(a.scheduledStart)} · {st?.name}</p>
                </div>
                {a.status === 'finalizado' ? <CheckCircle2 size={18} className="text-success" /> : <ChevronRight size={16} className="text-muted-foreground" />}
              </motion.button>
            );
          })}
          {appts.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma visita agendada para hoje.</p>}
        </div>

        {/* Estoque do técnico */}
        <p className="mb-2 mt-6 px-1 text-sm font-semibold text-foreground">Meu estoque</p>
        <Card>
          <CardBody className="space-y-2.5">
            {stock.length === 0 && <p className="text-sm text-muted-foreground">Sem produtos alocados.</p>}
            {stock.map(({ product, quantity }) => (
              <div key={product.id} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Package size={15} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.activeIngredient ?? product.manufacturer}</p>
                </div>
                <Badge tone={quantity <= 2 ? 'warning' : 'neutral'}>{quantity} {product.unit}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/** Produtos aplicados na visita: parte dos produtos padrão do serviço; o técnico
 *  marca os que realmente usou, ajusta a quantidade, remove ou adiciona outro. */
function AppliedProducts({ appt }: { appt: Appointment }) {
  const allProducts = useProductsStore((s) => s.items);
  const svc = getServiceType(appt.serviceTypeId);
  const base = appt.products?.length
    ? appt.products.map((p) => ({ productId: p.productId, qty: p.plannedQty }))
    : (svc?.defaultProducts ?? []);
  const [rows, setRows] = useState(() => base.map((b) => ({ productId: b.productId, qty: b.qty, used: true })));
  const [adding, setAdding] = useState('');

  const toggle = (id: string) => setRows((r) => r.map((x) => (x.productId === id ? { ...x, used: !x.used } : x)));
  const setQty = (id: string, qty: number) => setRows((r) => r.map((x) => (x.productId === id ? { ...x, qty } : x)));
  const removeRow = (id: string) => setRows((r) => r.filter((x) => x.productId !== id));
  const addRow = (id: string) => { if (id && !rows.some((x) => x.productId === id)) setRows((r) => [...r, { productId: id, qty: 1, used: true }]); setAdding(''); };

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Produtos aplicados</p>
      <div className="space-y-1.5">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto padrão para este serviço.</p>}
        {rows.map((row) => {
          const prod = getProduct(row.productId);
          return (
            <div key={row.productId} className="flex items-center gap-2 rounded-lg border border-border/60 p-2">
              <button onClick={() => toggle(row.productId)} className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition', row.used ? 'border-brand bg-brand text-brand-foreground' : 'border-border')}>
                {row.used && <CheckCircle2 size={13} />}
              </button>
              <span className={cn('flex-1 truncate text-sm', row.used ? 'text-foreground' : 'text-muted-foreground line-through')}>{prod?.name ?? row.productId}</span>
              <input type="number" min={0} step="0.5" value={row.qty} onChange={(e) => setQty(row.productId, Number(e.target.value) || 0)} disabled={!row.used} className="h-7 w-14 rounded border border-input bg-surface px-1.5 text-right text-sm disabled:opacity-50" />
              <span className="w-6 text-xs text-muted-foreground">{prod?.unit}</span>
              <button onClick={() => removeRow(row.productId)} className="text-muted-foreground hover:text-danger" title="Remover"><X size={15} /></button>
            </div>
          );
        })}
      </div>
      <div className="mt-2">
        <Select value={adding} onChange={(e) => addRow(e.target.value)} className="h-9 text-sm">
          <option value="">+ Adicionar outro produto…</option>
          {allProducts.filter((p) => !rows.some((r) => r.productId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/15 py-2">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] text-white/80">{label}</p>
    </div>
  );
}

function NextVisit({ appt }: { appt: Appointment }) {
  const cust = getCustomer(appt.customerId);
  const st = getServiceType(appt.serviceTypeId);
  const [started, setStarted] = useState(appt.status === 'em_atendimento');
  const checklist = ['Equipamentos', 'EPIs', 'Produtos', 'Veículo', 'Documentação'];
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  return (
    <Card hover className="overflow-hidden border-brand/30">
      <div className="flex items-center justify-between border-b border-border bg-brand-soft/30 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Próxima visita</p>
        <PriorityBadge priority={appt.priority} />
      </div>
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-foreground">{cust?.name}</p>
            <p className="text-sm text-muted-foreground">{st?.name} · {fmtTime(appt.scheduledStart)}</p>
          </div>
          <AppointmentStatusBadge status={started ? 'em_atendimento' : appt.status} />
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-sm">
          <MapPin size={16} className="mt-0.5 shrink-0 text-brand" />
          <span className="text-foreground">{appt.address}</span>
        </div>

        {cust?.permanentNotes && (
          <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft/60 p-3 text-sm">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-warning">Observações do contrato</p>
              <p className="text-foreground">{cust.permanentNotes}</p>
            </div>
          </div>
        )}
        {cust?.monitoringContracted && (
          <Badge tone="info" dot>Cliente com monitoramento contratado</Badge>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" leftIcon={<Navigation size={15} />}>Navegar</Button>
          <Button variant="outline" size="sm" leftIcon={<PhoneCall size={15} />}>Ligar</Button>
        </div>

        {/* Checklist pré-atendimento */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Checklist pré-atendimento</p>
          <div className="space-y-1.5">
            {checklist.map((item) => (
              <button key={item} onClick={() => setChecked((c) => ({ ...c, [item]: !c[item] }))} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left text-sm">
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-md border transition', checked[item] ? 'border-brand bg-brand text-brand-foreground' : 'border-border')}>
                  {checked[item] && <CheckCircle2 size={13} />}
                </span>
                <span className={cn(checked[item] ? 'text-muted-foreground line-through' : 'text-foreground')}>{item}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Produtos aplicados (padrão do serviço; técnico confirma o que usou) */}
        <AppliedProducts appt={appt} />

        <div className="grid grid-cols-1 gap-2">
          {!started ? (
            <Button leftIcon={<Play size={16} />} onClick={() => setStarted(true)}>Iniciar atendimento</Button>
          ) : (
            <Button variant="primary" leftIcon={<CheckCircle2 size={16} />}>Finalizar atendimento</Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm">Reagendar</Button>
            <Button variant="outline" size="sm" leftIcon={<TriangleAlert size={14} />}>Reportar problema</Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
