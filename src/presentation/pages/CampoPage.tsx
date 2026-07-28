import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, ChevronRight, Clock, FileText, Info, MapPin, Navigation, Package,
  PhoneCall, Play, TriangleAlert,
} from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Progress } from '../components/ui/misc';
import { Drawer } from '../components/ui/Drawer';
import { Select, Textarea } from '../components/ui/Field';
import { AppointmentStatusBadge, PriorityBadge } from '../components/StatusBadge';
import { RouteMap, type RouteStop } from '../components/RouteMap';
import { PhotoCapture } from '../components/PhotoCapture';
import { appointmentsForTechnician, getCustomer, getProduct, getServiceType, technicianBalances } from '@/application/repository';
import { useProductsStore } from '@/store/entityStores';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { toast } from '@/store/toastStore';
import { X } from 'lucide-react';
import type { Appointment, ServiceOrderPhoto } from '@/domain/types';
import { fmtTime } from '@/lib/date';
import { cn } from '@/lib/utils';
import { appleMapsLink, googleMapsRoute, wazeLink } from '@/lib/geo';
import { PreviewBanner, useFieldTech } from '../components/field/FieldTech';

/**
 * Painel do Técnico — experiência dedicada de campo (mobile-first).
 * Usa a identidade do técnico autenticado. Sem acesso a dados administrativos:
 * apenas a própria rotina, rota e estoque. Staff pode pré-visualizar qualquer
 * técnico através do seletor.
 */
export function CampoPage() {
  const { techId, techName } = useFieldTech();
  const setStatus = useAppointmentsStore((s) => s.setStatus);
  const updateAppt = useAppointmentsStore((s) => s.update);
  const storeAppts = useAppointmentsStore((s) => s.appointments); // reatividade

  const todayIso = new Date().toISOString();
  const appts = useMemo(() => appointmentsForTechnician(techId, todayIso), [techId, todayIso, storeAppts]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = appts.find((a) => a.id === activeId) ?? appts[0];
  const loc = `loc-${techId.replace('u-', '')}`;
  const stock = technicianBalances(loc);

  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [navAppt, setNavAppt] = useState<Appointment | null>(null);

  const doneCount = appts.filter((a) => a.status === 'finalizado').length;

  return (
    <div className="mx-auto max-w-md">
      <PreviewBanner />

      <div>
        {/* Cabeçalho do técnico */}
        <Card className="mb-4 overflow-hidden">
          <div className="bg-gradient-to-br from-brand to-emerald-600 p-5 text-white">
            <div className="flex items-center gap-3">
              <Avatar name={techName} size="lg" className="ring-white/30" />
              <div>
                <p className="text-lg font-bold">Olá, {techName.split(' ')[0]}</p>
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
        {active && (
          <NextVisit
            appt={active}
            onNavigate={() => setNavAppt(active)}
            onDetail={() => setDetailAppt(active)}
            onStart={() => setStatus(active.id, 'em_atendimento')}
            onFinish={() => { setStatus(active.id, 'finalizado'); toast('Visita finalizada e atualizada no sistema.', { tone: 'success' }); }}
          />
        )}

        {/* Rota do dia — toque abre; toque duplo abre os detalhes da visita */}
        <p className="mb-2 mt-6 px-1 text-sm font-semibold text-foreground">Rota de hoje <span className="font-normal text-muted-foreground">· toque duplo p/ detalhes</span></p>
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
                onDoubleClick={() => setDetailAppt(a)}
                className={cn('flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition', isActive ? 'border-brand bg-brand-soft/40 shadow-soft' : 'border-border bg-surface hover:bg-muted/40')}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{cust?.name}</p>
                  <p className="truncate text-xs text-muted-foreground"><Clock size={11} className="mr-1 inline" />{fmtTime(a.scheduledStart)} · {st?.name}</p>
                </div>
                <span role="button" tabIndex={-1} aria-label="Ver detalhes" onClick={(e) => { e.stopPropagation(); setDetailAppt(a); }} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><Info size={16} /></span>
                {a.status === 'finalizado' ? <CheckCircle2 size={18} className="text-success" /> : <ChevronRight size={16} className="text-muted-foreground" />}
              </motion.button>
            );
          })}
          {appts.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma visita agendada para hoje.</p>}
        </div>

        {/* Observação do técnico (aparece no sistema da empresa) */}
        {active && <TechNote appt={active} onSave={(text) => { updateAppt(active.id, { technicianNotes: text }); toast('Observação salva no sistema.', { tone: 'success' }); }} />}

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

      <VisitDetailDrawer appt={detailAppt} onClose={() => setDetailAppt(null)} onNavigate={(a) => { setDetailAppt(null); setNavAppt(a); }} />
      <NavigateDrawer appt={navAppt} onClose={() => setNavAppt(null)} />
    </div>
  );
}

/** Observação do técnico — salva na visita e visível no sistema da empresa. */
function TechNote({ appt, onSave }: { appt: Appointment; onSave: (text: string) => void }) {
  const [text, setText] = useState(appt.technicianNotes ?? '');
  useEffect(() => { setText(appt.technicianNotes ?? ''); }, [appt.id, appt.technicianNotes]);
  const dirty = text.trim() !== (appt.technicianNotes ?? '').trim();
  return (
    <div className="mt-6">
      <p className="mb-2 px-1 text-sm font-semibold text-foreground">Observação da visita <span className="font-normal text-muted-foreground">· {getCustomer(appt.customerId)?.name}</span></p>
      <Card>
        <CardBody className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: infestação em foco na cozinha; recomendado retorno em 15 dias; cliente ausente…" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Aparece no sistema da empresa.</span>
            <Button size="sm" leftIcon={<FileText size={14} />} disabled={!dirty} onClick={() => onSave(text.trim())}>Salvar observação</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/** Detalhe da visita para o técnico: produtos necessários, solicitação e infos. */
function VisitDetailDrawer({ appt, onClose, onNavigate }: { appt: Appointment | null; onClose: () => void; onNavigate: (a: Appointment) => void }) {
  const updateAppt = useAppointmentsStore((s) => s.update);
  const [photos, setPhotos] = useState<ServiceOrderPhoto[]>(appt?.photos ?? []);
  useEffect(() => { setPhotos(appt?.photos ?? []); }, [appt?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!appt) return null;
  const savePhotos = (next: ServiceOrderPhoto[]) => { setPhotos(next); updateAppt(appt.id, { photos: next }); };
  const cust = getCustomer(appt.customerId);
  const st = getServiceType(appt.serviceTypeId);
  const planned = appt.products?.length ? appt.products.map((p) => ({ productId: p.productId, qty: p.plannedQty })) : (st?.defaultProducts ?? []);
  const phone = cust?.phone?.replace(/[^\d+]/g, '');

  return (
    <Drawer open={!!appt} onClose={onClose} title={cust?.name ?? 'Visita'} subtitle={`${st?.name ?? ''} · ${fmtTime(appt.scheduledStart)}`}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <AppointmentStatusBadge status={appt.status} />
          <PriorityBadge priority={appt.priority} />
          {appt.fixedTime && <Badge tone="brand">Hora marcada</Badge>}
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-sm">
          <MapPin size={16} className="mt-0.5 shrink-0 text-brand" />
          <span className="text-foreground">{appt.address ?? '—'}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" leftIcon={<Navigation size={15} />} disabled={appt.latitude == null} onClick={() => onNavigate(appt)}>Navegar</Button>
          <Button variant="outline" size="sm" leftIcon={<PhoneCall size={15} />} disabled={!phone} onClick={() => phone && window.open(`tel:${phone}`)}>Ligar</Button>
        </div>

        <Section title="Produtos necessários">
          {planned.length === 0 ? <p className="text-sm text-muted-foreground">Sem produtos padrão para este serviço.</p> : (
            <div className="space-y-1.5">
              {planned.map((p) => {
                const prod = getProduct(p.productId);
                return (
                  <div key={p.productId} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <span className="text-foreground">{prod?.name ?? p.productId}</span>
                    <Badge tone="neutral">{p.qty} {prod?.unit}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Fotos do atendimento">
          <PhotoCapture photos={photos} onChange={savePhotos} />
        </Section>

        {appt.notes && <Section title="Solicitação / observações do agendamento"><p className="text-sm text-foreground">{appt.notes}</p></Section>}
        {cust?.permanentNotes && (
          <div className="rounded-lg border border-warning/30 bg-warning-soft/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">Observações do contrato</p>
            <p className="mt-0.5 text-sm text-foreground">{cust.permanentNotes}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Info2 label="Horário" value={`${fmtTime(appt.scheduledStart)}–${fmtTime(appt.scheduledEnd)}`} />
          <Info2 label="Duração" value={`${appt.estimatedMinutes ?? '—'} min`} />
          <Info2 label="Telefone" value={cust?.phone ?? '—'} />
          <Info2 label="Tipo de imóvel" value={cust?.propertyType ?? '—'} />
        </div>
      </div>
    </Drawer>
  );
}

/** Navegação: mostra a localização atual e o trajeto até a visita. */
function NavigateDrawer({ appt, onClose }: { appt: Appointment | null; onClose: () => void }) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  useEffect(() => {
    if (!appt) { setPos(null); setGeoState('idle'); return; }
    if (!('geolocation' in navigator)) { setGeoState('error'); return; }
    setGeoState('loading');
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeoState('ok'); },
      () => setGeoState('error'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [appt]);

  if (!appt) return null;
  const cust = getCustomer(appt.customerId);
  const dest = appt.latitude != null && appt.longitude != null ? { lat: appt.latitude, lng: appt.longitude } : null;
  const stops: RouteStop[] = [
    ...(pos ? [{ id: 'me', label: 'Você está aqui', lat: pos.lat, lng: pos.lng, color: 'rgb(37 99 235)' } as RouteStop] : []),
    ...(dest ? [{ id: 'dest', label: cust?.name ?? 'Destino', lat: dest.lat, lng: dest.lng } as RouteStop] : []),
  ];
  const open = (url: string) => window.open(url, '_blank', 'noopener');

  return (
    <Drawer open={!!appt} onClose={onClose} title="Navegação" subtitle={cust?.name}>
      <div className="space-y-4">
        {geoState === 'loading' && <p className="text-sm text-muted-foreground">Obtendo sua localização…</p>}
        {geoState === 'error' && <p className="rounded-lg bg-warning-soft/60 p-3 text-sm text-warning">Não foi possível obter sua localização (permissão negada). Mostrando apenas o destino.</p>}
        {geoState === 'ok' && <p className="flex items-center gap-1.5 text-sm text-brand"><span className="h-2.5 w-2.5 rounded-full" style={{ background: 'rgb(37 99 235)' }} /> Sua localização atual</p>}

        <RouteMap stops={stops} height={280} />

        <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-sm">
          <MapPin size={16} className="mt-0.5 shrink-0 text-brand" />
          <span className="text-foreground">{appt.address ?? '—'}</span>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Abrir no aplicativo de mapas</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" disabled={!dest} onClick={() => dest && open(googleMapsRoute(pos ? [pos, dest] : [dest]))}>Maps</Button>
            <Button variant="outline" size="sm" disabled={!dest} onClick={() => dest && open(wazeLink(dest))}>Waze</Button>
            <Button variant="outline" size="sm" disabled={!dest} onClick={() => dest && open(appleMapsLink(dest))}>Apple</Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{title}</p>
      {children}
    </div>
  );
}
function Info2({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/40 p-2.5"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p></div>;
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

function NextVisit({ appt, onNavigate, onDetail, onStart, onFinish }: {
  appt: Appointment;
  onNavigate: () => void;
  onDetail: () => void;
  onStart: () => void;
  onFinish: () => void;
}) {
  const cust = getCustomer(appt.customerId);
  const st = getServiceType(appt.serviceTypeId);
  const started = appt.status === 'em_atendimento';
  const finished = appt.status === 'finalizado';
  const checklist = ['Equipamentos', 'EPIs', 'Produtos', 'Veículo', 'Documentação'];
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);

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
          <AppointmentStatusBadge status={appt.status} />
        </div>

        <button onClick={onDetail} className="flex w-full items-start gap-2 rounded-xl bg-muted/50 p-3 text-left text-sm transition hover:bg-muted">
          <MapPin size={16} className="mt-0.5 shrink-0 text-brand" />
          <span className="flex-1 text-foreground">{appt.address}</span>
          <Info size={15} className="shrink-0 text-muted-foreground" />
        </button>

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
          <Button variant="outline" size="sm" leftIcon={<Navigation size={15} />} disabled={appt.latitude == null || appt.longitude == null} onClick={onNavigate}>Navegar</Button>
          <Button
            variant="outline" size="sm" leftIcon={<PhoneCall size={15} />}
            disabled={!cust?.phone}
            onClick={() => cust?.phone && window.open(`tel:${cust.phone.replace(/[^\d+]/g, '')}`)}
          >Ligar</Button>
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
          {finished ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-success/40 bg-success-soft/40 py-2.5 text-sm font-medium text-success">
              <CheckCircle2 size={16} /> Visita finalizada
            </div>
          ) : !started ? (
            <Button leftIcon={<Play size={16} />} onClick={onStart}>Iniciar atendimento</Button>
          ) : confirming ? (
            <div className="rounded-xl border border-brand/40 bg-brand-soft/30 p-3">
              <p className="mb-2 text-sm font-medium text-foreground">Confirmar finalização desta visita? O sistema da empresa será atualizado.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Voltar</Button>
                <Button variant="primary" size="sm" leftIcon={<CheckCircle2 size={15} />} onClick={() => { onFinish(); setConfirming(false); }}>Confirmar</Button>
              </div>
            </div>
          ) : (
            <Button variant="primary" leftIcon={<CheckCircle2 size={16} />} onClick={() => setConfirming(true)}>Finalizar atendimento</Button>
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
