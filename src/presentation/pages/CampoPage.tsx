import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CheckCircle2, ChevronRight, Clock, FileText, Info, Map as MapIcon, MapPin, Navigation,
  Pencil, PhoneCall, Play, TriangleAlert,
} from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Progress } from '../components/ui/misc';
import { Drawer } from '../components/ui/Drawer';
import { Select, Textarea } from '../components/ui/Field';
import { Segmented } from '../components/ui/Segmented';
import { AppointmentStatusBadge, PriorityBadge } from '../components/StatusBadge';
import { RouteMap, type RouteStop } from '../components/RouteMap';
import { PhotoCapture } from '../components/PhotoCapture';
import { SignaturePad } from '../components/SignaturePad';
import { useSettingsStore } from '@/store/settingsStore';
import { releasedAppointmentsForTechnician, getCustomer, getProduct, getServiceType, serviceOrderForAppointment } from '@/application/repository';
import { useProductsStore } from '@/store/entityStores';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { useServiceOrdersStore } from '@/store/serviceOrdersStore';
import { useStockStore } from '@/store/stockStore';
import { logChange } from '@/store/auditStore';
import { toast } from '@/store/toastStore';
import { X } from 'lucide-react';
import type { Appointment, Customer, PaymentStatus, ServiceOrder, ServiceOrderPhoto, ServiceOrderProduct } from '@/domain/types';
import { fmtTime } from '@/lib/date';
import { cn, formatDocument } from '@/lib/utils';
import { formatAddress, googleMapsRoute, googleMapsRouteToAddress } from '@/lib/geo';
import { PreviewBanner, useFieldTech } from '../components/field/FieldTech';
import { VisitActionsMenu } from '../components/field/VisitActions';
import { ensureTechnicianStockLocation, technicianStockLocationId } from '@/store/stockLocations';

/** Linha de produto aplicado em campo — quantidade e se foi de fato usado. */
interface AppliedProductRow { productId: string; qty: number; used: boolean }

/** Dados que o técnico registra ao finalizar/editar o atendimento. */
interface FieldSaveData {
  signature?: string;
  products: AppliedProductRow[];
  paymentStatus: PaymentStatus;
}

/** Local de estoque de um técnico (cadastro real — ver store/stockLocations.ts). */
function techStockLocationId(techId: string): string | undefined {
  return technicianStockLocationId(techId);
}

/** Saldo combinado de um produto somando o estoque de todos os técnicos
 *  informados — quando a OS tem mais de um técnico, o estoque de ambos
 *  conta como um só naquela OS (um pode levar equipamento/produto pro
 *  outro usar). */
function pooledBalance(technicianIds: string[], productId: string): number {
  const { balanceOf } = useStockStore.getState();
  return technicianIds.reduce((sum, id) => {
    const loc = techStockLocationId(id);
    return loc ? sum + balanceOf(loc, productId) : sum;
  }, 0);
}

/** Ajusta o estoque dos técnicos da OS pela diferença entre o que estava
 *  registrado e o que foi salvo agora — evita dar baixa em dobro ao editar
 *  depois de finalizar (só a diferença é consumida ou devolvida). A baixa
 *  sai primeiro do estoque de quem está finalizando agora; faltando, completa
 *  pelo estoque dos outros técnicos da OS (estoque combinado — ver
 *  pooledBalance). Se mesmo assim faltar, consome o que der e sinaliza
 *  `outOfStock` no produto (não bloqueia o atendimento: pode ter sido um
 *  erro de comunicação entre o técnico e o almoxarifado). Devolução (diff
 *  negativo) sempre volta pro estoque de quem está editando agora.
 *  Retorna o conjunto de productIds que ficaram marcados fora do estoque. */
function reconcileTechStock(
  technicianIds: string[],
  currentTechId: string,
  previous: ServiceOrderProduct[] | undefined,
  next: AppliedProductRow[],
): Set<string> {
  const store = useStockStore.getState();
  const currentLoc = techStockLocationId(currentTechId);
  const otherIds = technicianIds.filter((id) => id !== currentTechId);
  const prevMap = new Map((previous ?? []).map((p) => [p.productId, p.usedQty]));
  const nextMap = new Map(next.filter((p) => p.used).map((p) => [p.productId, p.qty]));
  const ids = new Set([...prevMap.keys(), ...nextMap.keys()]);
  const outOfStock = new Set<string>();

  ids.forEach((id) => {
    const diff = (nextMap.get(id) ?? 0) - (prevMap.get(id) ?? 0);
    if (diff === 0) return;
    if (diff < 0) {
      if (currentLoc) store.entry(currentLoc, id, -diff);
      return;
    }
    const available = pooledBalance(technicianIds, id);
    if (diff > available) outOfStock.add(id);

    let remaining = diff;
    if (currentLoc) {
      const fromCurrent = Math.min(remaining, store.balanceOf(currentLoc, id));
      if (fromCurrent > 0) { store.consume(currentLoc, id, fromCurrent); remaining -= fromCurrent; }
    }
    for (const otherId of otherIds) {
      if (remaining <= 0) break;
      const loc = techStockLocationId(otherId);
      if (!loc) continue;
      const fromOther = Math.min(remaining, store.balanceOf(loc, id));
      if (fromOther > 0) { store.consume(loc, id, fromOther); remaining -= fromOther; }
    }
    // Se ainda sobrou (ninguém tinha o suficiente), a diferença não vira
    // saldo negativo em lugar nenhum — só fica registrada via outOfStock.
  });

  return outOfStock;
}

/** Produtos aplicados padrão da visita — parte do que já foi registrado na OS
 *  (se o atendimento já foi finalizado antes) ou do plano original. */
function defaultProductRows(appt: Appointment, linkedOs?: ServiceOrder): AppliedProductRow[] {
  if (linkedOs?.products?.length) {
    return linkedOs.products.map((p) => ({ productId: p.productId, qty: p.usedQty, used: true }));
  }
  const svc = getServiceType(appt.serviceTypeId);
  const base = appt.products?.length ? appt.products.map((p) => ({ productId: p.productId, qty: p.plannedQty })) : (svc?.defaultProducts ?? []);
  return base.map((b) => ({ productId: b.productId, qty: b.qty, used: true }));
}

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
  const updateOs = useServiceOrdersStore((s) => s.update);

  // Técnicos cadastrados antes de os locais de estoque virarem cadastro real
  // (ou criados pela Edge Function de convite, que grava direto em
  // public.users) ainda não têm o seu — garante aqui, na primeira vez que o
  // app de campo abre para ele. Idempotente.
  useEffect(() => { if (techId) ensureTechnicianStockLocation(techId, techName); }, [techId, techName]);

  const todayIso = new Date().toISOString();
  const appts = useMemo(() => releasedAppointmentsForTechnician(techId, todayIso), [techId, todayIso, storeAppts]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = appts.find((a) => a.id === activeId) ?? appts[0];

  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [navAppt, setNavAppt] = useState<Appointment | null>(null);
  // "Fechar ordem de serviço" no menu Gerenciar abre o mesmo fluxo de
  // finalização que vive no cartão da visita — o contador é o gatilho.
  const [finishSignal, setFinishSignal] = useState(0);

  const doneCount = appts.filter((a) => a.status === 'finalizado').length;

  /** Ao iniciar, também sinaliza a OS como em andamento — junto com as fotos
   *  liberadas a partir daqui, serve de "check" de que o atendimento começou. */
  const handleStart = () => {
    if (!active) return;
    setStatus(active.id, 'em_atendimento');
    const so = serviceOrderForAppointment(active.id);
    if (so && so.status !== 'concluida') {
      updateOs(so.id, { status: 'em_andamento', startedAt: so.startedAt ?? new Date().toISOString() });
    }
  };

  /** Finaliza o atendimento: grava assinatura, produtos aplicados e pagamento
   *  na OS, dá baixa no estoque combinado dos técnicos da OS (ver
   *  reconcileTechStock) e registra o histórico da OS. */
  const handleFinish = ({ signature, products, paymentStatus }: FieldSaveData) => {
    if (!active) return;
    const so = serviceOrderForAppointment(active.id);
    const now = new Date().toISOString();
    updateAppt(active.id, { technicianSignature: signature });
    setStatus(active.id, 'finalizado');
    if (so) {
      // A assinatura do cliente é colhida no menu Gerenciar; é ela que sai
      // no PDF da OS, então precisa ser copiada para lá ao fechar.
      const customerSignature = active.customerSignature ?? so.customerSignature;
      const technicianIds = so.technicianIds?.length ? so.technicianIds : [so.technicianId ?? techId];
      const outOfStock = reconcileTechStock(technicianIds, techId, so.products, products);
      updateOs(so.id, {
        status: 'concluida',
        finishedAt: now,
        products: products.filter((p) => p.used).map((p) => ({ productId: p.productId, usedQty: p.qty, outOfStock: outOfStock.has(p.productId) || undefined })),
        paymentStatus,
        paymentDate: paymentStatus === 'pago' ? now : so.paymentDate,
        technicianSignature: signature,
        customerSignature,
        hasCustomerSignature: !!customerSignature,
      });
      if (outOfStock.size) toast('Alguns produtos foram usados além do estoque disponível — sinalizado na OS.', { tone: 'warning' });
      logChange('conclusão', 'ordem de serviço', `OS #${so.number} finalizada em campo por ${techName} em ${new Date(now).toLocaleString('pt-BR')}`, so.id);
    }
    const next = appts.find((a) => a.id !== active.id && a.status !== 'finalizado');
    setActiveId(next ? next.id : null);
    toast('Visita finalizada e assinada.', { tone: 'success' });
  };

  /** Corrige um atendimento já finalizado — atualiza a OS de novo, mas o
   *  histórico registra "alteração", não uma nova finalização. */
  const handleEditSave = ({ products, paymentStatus }: FieldSaveData) => {
    if (!active) return;
    const so = serviceOrderForAppointment(active.id);
    if (!so) return;
    const now = new Date().toISOString();
    const technicianIds = so.technicianIds?.length ? so.technicianIds : [so.technicianId ?? techId];
    const outOfStock = reconcileTechStock(technicianIds, techId, so.products, products);
    updateOs(so.id, {
      products: products.filter((p) => p.used).map((p) => ({ productId: p.productId, usedQty: p.qty, outOfStock: outOfStock.has(p.productId) || undefined })),
      paymentStatus,
      paymentDate: paymentStatus === 'pago' ? (so.paymentDate ?? now) : so.paymentDate,
    });
    if (outOfStock.size) toast('Alguns produtos foram usados além do estoque disponível — sinalizado na OS.', { tone: 'warning' });
    logChange('alteração', 'ordem de serviço', `OS #${so.number} corrigida em campo por ${techName} em ${new Date(now).toLocaleString('pt-BR')}`, so.id);
    toast('Alterações salvas no sistema.', { tone: 'success' });
  };

  return (
    <div className="mx-auto max-w-md">
      <PreviewBanner />

      <div>
        {/* Cabeçalho do técnico */}
        <Card className="mb-4 overflow-hidden">
          <div className="bg-gradient-to-br from-brand to-red-900 p-5 text-white">
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
            techId={techId}
            onNavigate={() => setNavAppt(active)}
            onDetail={() => setDetailAppt(active)}
            onStart={handleStart}
            onFinish={handleFinish}
            onEditSave={handleEditSave}
            onPhotosChange={(photos) => updateAppt(active.id, { photos })}
            finishSignal={finishSignal}
            actions={
              <VisitActionsMenu
                appt={active}
                techId={techId}
                techName={techName}
                onFinishRequest={() => {
                  if (active.status === 'finalizado') { toast('Esta visita já foi finalizada.', { tone: 'info' }); return; }
                  if (active.status !== 'em_atendimento') { toast('Inicie o atendimento antes de fechar a ordem de serviço.', { tone: 'warning' }); return; }
                  setFinishSignal((n) => n + 1);
                }}
              />
            }
          />
        )}

        {/* Rota do dia — toque abre; toque duplo abre os detalhes da visita */}
        <div className="mb-2 mt-6 flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-foreground">Rota de hoje <span className="font-normal text-muted-foreground">· toque duplo p/ detalhes</span></p>
          <Link to="/campo/mapa" className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"><MapIcon size={13} /> Mapa</Link>
        </div>
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
  const linkedOs = serviceOrderForAppointment(appt.id);
  const planned = appt.products?.length ? appt.products.map((p) => ({ productId: p.productId, qty: p.plannedQty })) : (st?.defaultProducts ?? []);
  const phone = cust?.phone?.replace(/[^\d+]/g, '');
  const canNavigateTo = appt.latitude != null || !!appt.address || !!(cust && formatAddress(cust));

  return (
    <Drawer open={!!appt} onClose={onClose} title={cust?.name ?? 'Visita'} subtitle={`${st?.name ?? ''} · ${fmtTime(appt.scheduledStart)}`}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <AppointmentStatusBadge status={appt.status} />
          <PriorityBadge priority={appt.priority} />
          {appt.fixedTime && <Badge tone="brand">Hora marcada</Badge>}
          <PaymentBadge so={linkedOs} />
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-sm">
          <MapPin size={16} className="mt-0.5 shrink-0 text-brand" />
          <span className="text-foreground">{appt.address ?? '—'}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" leftIcon={<Navigation size={15} />} disabled={!canNavigateTo} onClick={() => onNavigate(appt)}>Navegar</Button>
          <Button variant="outline" size="sm" leftIcon={<PhoneCall size={15} />} disabled={!phone} onClick={() => phone && window.open(`tel:${phone}`)}>Ligar</Button>
        </div>

        {(linkedOs?.areaTreated || linkedOs?.procedures) && (
          <Section title="Necessidades do serviço">
            <div className="space-y-1.5 text-sm">
              {linkedOs?.areaTreated && (
                <p className="text-foreground"><span className="font-medium">Áreas/cômodos a revisar:</span> {linkedOs.areaTreated}</p>
              )}
              {linkedOs?.procedures && (
                <p className="text-foreground"><span className="font-medium">Observação da OS:</span> {linkedOs.procedures}</p>
              )}
            </div>
          </Section>
        )}

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

        {linkedOs?.technicianMessage && (
          <div className="rounded-lg border border-brand/30 bg-brand-soft/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Mensagem para o técnico</p>
            <p className="mt-0.5 text-sm text-foreground">{linkedOs.technicianMessage}</p>
          </div>
        )}
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
        </div>

        <CustomerInfoSection customer={cust} />
      </div>
    </Drawer>
  );
}

/**
 * Dados cadastrais do cliente no app de campo — o técnico precisa saber com
 * quem falar, para onde ir e o que esperar do imóvel sem depender de ligar
 * para o escritório.
 */
function CustomerInfoSection({ customer: c }: { customer?: Customer }) {
  if (!c) return null;
  const contacts = c.contacts ?? [];
  const principal = contacts.find((ct) => ct.isPrincipal) ?? contacts[0];
  const outros = contacts.filter((ct) => ct.id !== principal?.id);
  const endereco = formatAddress(c);
  const tel = (n?: string) => n?.replace(/[^\d+]/g, '');

  return (
    <Section title="Dados do cliente">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{c.name}</p>
          {c.companyName && <p className="text-xs text-muted-foreground">{c.companyName}</p>}
          <p className="text-xs text-muted-foreground">
            {c.type === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'}
            {c.document ? ` · ${formatDocument(c.document)}` : ''}
          </p>
        </div>

        {endereco && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span className="text-foreground">{endereco}</span>
          </div>
        )}

        {/* Contatos: tocáveis, para ligar direto do celular. */}
        {(principal || c.phone) && (
          <div className="space-y-1.5">
            {c.phone && (
              <a href={`tel:${tel(c.phone)}`} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm transition hover:bg-muted">
                <span className="text-muted-foreground">Telefone principal</span>
                <span className="font-medium text-brand">{c.phone}</span>
              </a>
            )}
            {principal && (
              <a href={`tel:${tel(principal.phone)}`} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm transition hover:bg-muted">
                <span className="min-w-0 truncate text-muted-foreground">{principal.name}{principal.role ? ` · ${principal.role}` : ''}</span>
                <span className="ml-2 shrink-0 font-medium text-brand">{principal.phone}</span>
              </a>
            )}
            {outros.map((ct) => (
              <a key={ct.id} href={`tel:${tel(ct.phone)}`} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm transition hover:bg-muted">
                <span className="min-w-0 truncate text-muted-foreground">{ct.name}{ct.role ? ` · ${ct.role}` : ''}</span>
                <span className="ml-2 shrink-0 font-medium text-brand">{ct.phone}</span>
              </a>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Info2 label="Tipo de imóvel" value={c.propertyType ?? '—'} />
          <Info2 label="Área" value={c.areaM2 ? `${c.areaM2} m²` : '—'} />
          {c.roomCount != null && <Info2 label="Cômodos" value={String(c.roomCount)} />}
          {c.email && <Info2 label="E-mail" value={c.email} />}
        </div>

        {!!c.localStructure?.length && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Estrutura do local</p>
            <div className="flex flex-wrap gap-1.5">
              {c.localStructure.map((s) => {
                const qty = c.localStructureQty?.[s];
                return <Badge key={s} tone="neutral">{qty && qty > 1 ? `${qty} ${s}` : s}</Badge>;
              })}
            </div>
          </div>
        )}

        {!!c.reservoirs?.length && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Reservatórios</p>
            <div className="flex flex-wrap gap-1.5">
              {c.reservoirs.map((r) => <Badge key={r.id} tone="neutral">{r.type}{r.location ? ` · ${r.location}` : ''}</Badge>)}
            </div>
          </div>
        )}

        {(!!c.tags.length || c.monitoringContracted) && (
          <div className="flex flex-wrap gap-1.5">
            {c.monitoringContracted && <Badge tone="info" dot>Monitoramento contratado</Badge>}
            {c.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
          </div>
        )}

        {c.notes && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Observações do cadastro</p>
            <p className="text-sm text-foreground">{c.notes}</p>
          </div>
        )}
      </div>
    </Section>
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
  // Sem coordenadas cadastradas, cai pro endereço em texto — o app de mapas
  // geocodifica sozinho ao abrir, então a navegação continua funcionando.
  const addressFallback = appt.address || (cust ? formatAddress(cust) : '');
  const canNavigate = !!dest || !!addressFallback;
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

        <Button
          variant="outline" size="sm" className="w-full"
          disabled={!canNavigate}
          onClick={() => open(dest ? googleMapsRoute(pos ? [pos, dest] : [dest]) : googleMapsRouteToAddress(addressFallback))}
        >
          Abrir no Google Maps
        </Button>
      </div>
    </Drawer>
  );
}

/** Situação do pagamento — só leitura para o técnico (definida pelo escritório na OS). */
function PaymentBadge({ so }: { so?: ServiceOrder }) {
  if (!so?.serviceValue) return null;
  const paid = so.paymentStatus === 'pago';
  return (
    <Badge tone={paid ? 'success' : 'warning'} dot>
      Pagamento: {paid ? 'Pago ✓' : 'Pendente ⚠️'}
    </Badge>
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
 *  marca os que realmente usou, ajusta a quantidade, remove ou adiciona outro.
 *  Controlado pelo pai — persistido na OS e no estoque só ao salvar/finalizar.
 *  `technicianIds` mostra quanto tem disponível no estoque combinado de todos
 *  os técnicos da OS (não bloqueia usar mais do que isso — só avisa; a OS
 *  fica marcada como "fora do estoque" ao salvar). */
function AppliedProducts({ value, onChange, disabled, technicianIds }: {
  value: AppliedProductRow[];
  onChange: (rows: AppliedProductRow[]) => void;
  disabled?: boolean;
  technicianIds: string[];
}) {
  const allProducts = useProductsStore((s) => s.items);
  useStockStore((s) => s.balances); // re-renderiza quando o estoque muda (pooledBalance lê getState() por baixo)
  const [adding, setAdding] = useState('');

  const available = (productId: string) => pooledBalance(technicianIds, productId);

  const toggle = (id: string) => onChange(value.map((x) => (x.productId === id ? { ...x, used: !x.used } : x)));
  const setQty = (id: string, qty: number) => onChange(value.map((x) => (x.productId === id ? { ...x, qty } : x)));
  const removeRow = (id: string) => onChange(value.filter((x) => x.productId !== id));
  const addRow = (id: string) => { if (id && !value.some((x) => x.productId === id)) onChange([...value, { productId: id, qty: 1, used: true }]); setAdding(''); };

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Produtos aplicados</p>
      <div className="space-y-1.5">
        {value.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto padrão para este serviço.</p>}
        {value.map((row) => {
          const prod = getProduct(row.productId);
          const avail = available(row.productId);
          const short = row.used && row.qty > avail;
          return (
            <div key={row.productId} className={cn('rounded-lg border p-2', short ? 'border-warning/50 bg-warning-soft/20' : 'border-border/60')}>
              <div className="flex items-center gap-2">
                <button disabled={disabled} onClick={() => toggle(row.productId)} className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition', row.used ? 'border-brand bg-brand text-brand-foreground' : 'border-border')}>
                  {row.used && <CheckCircle2 size={13} />}
                </button>
                <span className={cn('flex-1 truncate text-sm', row.used ? 'text-foreground' : 'text-muted-foreground line-through')}>{prod?.name ?? row.productId}</span>
                <input type="number" min={0} step="0.5" value={row.qty} onChange={(e) => setQty(row.productId, Number(e.target.value) || 0)} disabled={disabled || !row.used} className="h-7 w-14 rounded border border-input bg-surface px-1.5 text-right text-sm disabled:opacity-50" />
                <span className="w-6 text-xs text-muted-foreground">{prod?.unit}</span>
                <button disabled={disabled} onClick={() => removeRow(row.productId)} className="text-muted-foreground hover:text-danger disabled:opacity-40" title="Remover"><X size={15} /></button>
              </div>
              <p className={cn('mt-1 pl-7 text-xs', short ? 'text-warning' : 'text-muted-foreground')}>
                {short ? (
                  <><TriangleAlert size={11} className="mr-1 inline" />Disponível no estoque: {avail} {prod?.unit} — vai ficar sinalizado na OS</>
                ) : (
                  <>Disponível no estoque: {avail} {prod?.unit}</>
                )}
              </p>
            </div>
          );
        })}
      </div>
      {!disabled && (
        <div className="mt-2">
          <Select value={adding} onChange={(e) => addRow(e.target.value)} className="h-9 text-sm">
            <option value="">+ Adicionar outro produto…</option>
            {allProducts.filter((p) => !value.some((r) => r.productId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      )}
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

function NextVisit({ appt, techId, onNavigate, onDetail, onStart, onFinish, onEditSave, onPhotosChange, finishSignal, actions }: {
  appt: Appointment;
  techId: string;
  onNavigate: () => void;
  onDetail: () => void;
  onStart: () => void;
  onFinish: (data: FieldSaveData) => void;
  onEditSave: (data: FieldSaveData) => void;
  onPhotosChange: (photos: ServiceOrderPhoto[]) => void;
  /** Muda quando o menu Gerenciar pede para fechar a OS. */
  finishSignal: number;
  actions: React.ReactNode;
}) {
  const cust = getCustomer(appt.customerId);
  const st = getServiceType(appt.serviceTypeId);
  const linkedOs = serviceOrderForAppointment(appt.id);
  const started = appt.status === 'em_atendimento';
  const finished = appt.status === 'finalizado';
  const checklist = ['Equipamentos', 'EPIs', 'Produtos', 'Veículo', 'Documentação'];
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [editingAfterFinish, setEditingAfterFinish] = useState(false);
  const storedSig = useSettingsStore((s) => s.signatures[techId]);
  const [signature, setSignature] = useState<string | undefined>(appt.technicianSignature ?? storedSig);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(linkedOs?.paymentStatus ?? 'pendente');
  const [productRows, setProductRows] = useState<AppliedProductRow[]>(() => defaultProductRows(appt, linkedOs));

  // Ao trocar de visita ativa, repopula os estados locais a partir da OS dela.
  useEffect(() => {
    setEditingAfterFinish(false);
    setConfirming(false);
    setPaymentStatus(linkedOs?.paymentStatus ?? 'pendente');
    setProductRows(defaultProductRows(appt, linkedOs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt.id]);

  // "Fechar ordem de serviço" pelo menu Gerenciar abre a confirmação daqui.
  useEffect(() => {
    if (finishSignal > 0) setConfirming(true);
  }, [finishSignal]);

  // Antes de "Iniciar atendimento" tudo fica travado; depois de finalizado,
  // só volta a ficar editável se o técnico entrar no modo de edição — as
  // fotos servem de "check" de que o atendimento realmente está em curso.
  const canEditNow = (started && !finished) || editingAfterFinish;
  const locked = !canEditNow;
  const hasPayableValue = linkedOs?.serviceValue != null && linkedOs.serviceValue > 0;

  return (
    <Card hover className="overflow-hidden border-brand/30">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-brand-soft/30 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Próxima visita</p>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={appt.priority} />
          {actions}
        </div>
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
        <div className="flex flex-wrap gap-1.5">
          {cust?.monitoringContracted && (
            <Badge tone="info" dot>Cliente com monitoramento contratado</Badge>
          )}
          <PaymentBadge so={linkedOs} />
        </div>
        {linkedOs?.technicianMessage && (
          <div className="flex items-start gap-2 rounded-xl border border-brand/30 bg-brand-soft/40 p-3 text-sm">
            <Info size={16} className="mt-0.5 shrink-0 text-brand" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">Mensagem para o técnico</p>
              <p className="text-foreground">{linkedOs.technicianMessage}</p>
            </div>
          </div>
        )}

        {(linkedOs?.areaTreated || linkedOs?.procedures) && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Necessidades do serviço</p>
            {linkedOs?.areaTreated && <p className="text-foreground"><span className="font-medium">Áreas/cômodos a revisar:</span> {linkedOs.areaTreated}</p>}
            {linkedOs?.procedures && <p className="mt-1 text-foreground"><span className="font-medium">Observação da OS:</span> {linkedOs.procedures}</p>}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" leftIcon={<Navigation size={15} />} disabled={appt.latitude == null && !appt.address && !(cust && formatAddress(cust))} onClick={onNavigate}>Navegar</Button>
          <Button
            variant="outline" size="sm" leftIcon={<PhoneCall size={15} />}
            disabled={!cust?.phone}
            onClick={() => cust?.phone && window.open(`tel:${cust.phone.replace(/[^\d+]/g, '')}`)}
          >Ligar</Button>
          <Button variant="outline" size="sm" leftIcon={<Info size={15} />} onClick={onDetail}>Cliente</Button>
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
        <AppliedProducts
          value={productRows}
          onChange={setProductRows}
          disabled={locked}
          technicianIds={linkedOs?.technicianIds?.length ? linkedOs.technicianIds : [linkedOs?.technicianId ?? techId]}
        />

        {/* Fotos de antes/depois — só liberadas após iniciar; servem de check
         *  de que o atendimento realmente está sendo feito. */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            Fotos do atendimento (antes / depois){locked && !finished ? ' — inicie o atendimento para registrar' : ''}
          </p>
          <PhotoCapture photos={appt.photos ?? []} onChange={onPhotosChange} compact disabled={locked} />
        </div>

        <div className="grid grid-cols-1 gap-2">
          {finished && !editingAfterFinish && (
            <>
              <div className="flex items-center justify-center gap-2 rounded-lg border border-success/40 bg-success-soft/40 py-2.5 text-sm font-medium text-success">
                <CheckCircle2 size={16} /> Visita finalizada
              </div>
              <Button variant="outline" size="sm" leftIcon={<Pencil size={14} />} onClick={() => setEditingAfterFinish(true)}>Editar atendimento</Button>
            </>
          )}
          {!finished && !started && (
            <Button leftIcon={<Play size={16} />} onClick={onStart}>Iniciar atendimento</Button>
          )}
          {canEditNow && (
            <>
              {/* Marcadores de pagamento — o técnico confirma após passar a máquina */}
              {hasPayableValue && (
                <div className="rounded-xl border border-border bg-muted/30 p-2.5">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">O serviço foi pago?</p>
                  <Segmented
                    size="sm"
                    value={paymentStatus === 'pago' ? 'pago' : 'pendente'}
                    onChange={(v) => setPaymentStatus(v as PaymentStatus)}
                    options={[{ value: 'pendente', label: 'Não pago' }, { value: 'pago', label: 'Pago' }]}
                  />
                </div>
              )}

              {editingAfterFinish ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingAfterFinish(false)}>Cancelar</Button>
                  <Button
                    variant="primary" size="sm" leftIcon={<CheckCircle2 size={15} />}
                    onClick={() => { onEditSave({ products: productRows, paymentStatus }); setEditingAfterFinish(false); }}
                  >Salvar alterações</Button>
                </div>
              ) : confirming ? (
                <div className="rounded-xl border border-brand/40 bg-brand-soft/30 p-3">
                  <p className="mb-2 text-sm font-medium text-foreground">Assine para finalizar. O sistema da empresa será atualizado.</p>
                  <SignaturePad key={appt.id} value={signature} onChange={setSignature} height={120} label="Assinatura do técnico" />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Voltar</Button>
                    <Button
                      variant="primary" size="sm" leftIcon={<CheckCircle2 size={15} />}
                      onClick={() => { onFinish({ signature, products: productRows, paymentStatus }); setConfirming(false); }}
                    >Confirmar</Button>
                  </div>
                </div>
              ) : (
                <Button variant="primary" leftIcon={<CheckCircle2 size={16} />} onClick={() => setConfirming(true)}>Finalizar atendimento</Button>
              )}
            </>
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
