/**
 * Ações da visita no App do Técnico — o menu "Gerenciar".
 *
 * Reúne num só lugar tudo que o técnico precisa fazer durante o atendimento
 * sem depender do escritório: ver os serviços da OS, inspecionar as
 * armadilhas do cliente, abrir não conformidade, percorrer o checklist de
 * verificação do local, colher as assinaturas e fechar a ordem de serviço.
 *
 * Cada item abre uma gaveta própria; o que é gravado vai direto para as
 * stores compartilhadas (visita, OS, armadilhas, não conformidades), então
 * aparece no sistema da empresa na hora.
 */
import { useEffect, useMemo, useState } from 'react';
import { Bug, CheckCircle2, ClipboardCheck, ClipboardList, Eye, PenLine, Plus, Radar, Settings2, TriangleAlert } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { SignaturePad } from '../SignaturePad';
import { SignerFields, SignerSummary } from '../SignerFields';
import { signerMissing } from '@/lib/signer';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { useServiceOrdersStore } from '@/store/serviceOrdersStore';
import { useTrapsStore } from '@/store/trapsStore';
import { useNonConformitiesStore, useTrapTypesStore } from '@/store/entityStores';
import { useSettingsStore } from '@/store/settingsStore';
import { uid } from '@/store/createEntityStore';
import { currentOrgId } from '@/store/appStore';
import { logChange } from '@/store/auditStore';
import { toast } from '@/store/toastStore';
import {
  getCustomer, getPest, getProduct, getServiceType, serviceOrderForAppointment,
} from '@/application/repository';
import { useAreasStore } from '@/store/entityStores';
import { NC_CATEGORY_LABEL } from '@/lib/printReports';
import { fmtDate, localDayKey } from '@/lib/date';
import { projectPoints } from '@/lib/geo';
import type {
  Appointment, NonConformity, ServiceOrder, SignerInfo, TrapDevice, VerificationItem,
} from '@/domain/types';
import type { AppointmentPriority } from '@/domain/enums';

type ActionKey = 'servicos' | 'armadilhas' | 'nao_conformidade' | 'verificacao' | 'assinar' | 'ver_assinatura';

/** Pontos que todo imóvel tem, usados quando o cliente não tem estrutura
 *  cadastrada nem a OS traz áreas — o técnico ainda assim tem o que conferir. */
const PONTOS_PADRAO = [
  'Focos de proliferação',
  'Condições de limpeza',
  'Vedação de portas e janelas',
  'Ralos e caixas de gordura',
  'Armazenamento de resíduos',
  'Sinais de infestação',
];

/**
 * Indicador de que o atendimento tem armadilhas a monitorar. Fica visível no
 * cartão da visita, sem depender de abrir o menu — é a informação que muda o
 * que o técnico leva e quanto tempo a visita dura.
 */
export function TrapsIndicator({ customerId, onOpen }: { customerId: string; onOpen: () => void }) {
  const traps = useTrapsStore((s) => s.traps.filter((t) => t.customerId === customerId));
  const inspections = useTrapsStore((s) => s.inspections);
  if (traps.length === 0) return null;

  const hoje = localDayKey();
  const ids = new Set(traps.map((t) => t.id));
  const feitasHoje = inspections.filter((i) => ids.has(i.trapId) && localDayKey(i.date) === hoje).length;
  const completo = feitasHoje >= traps.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-2.5 rounded-xl border p-3 text-left transition ${
        completo ? 'border-success/40 bg-success-soft/40 hover:bg-success-soft/60' : 'border-brand/40 bg-brand-soft/30 hover:bg-brand-soft/50'
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${completo ? 'bg-success/15 text-success' : 'bg-brand/15 text-brand'}`}>
        <Radar size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          Monitoramento de armadilhas — {traps.length}
        </span>
        <span className="block text-xs text-muted-foreground">
          {completo ? 'Todas inspecionadas hoje' : `${feitasHoje} de ${traps.length} inspecionadas nesta visita`}
        </span>
      </span>
      <Badge tone={completo ? 'success' : 'brand'} className="text-[10px]">{completo ? 'OK' : 'Pendente'}</Badge>
    </button>
  );
}

export function VisitActionsMenu({ appt, techId, techName, onFinishRequest, openTrapsSignal = 0 }: {
  appt: Appointment;
  techId: string;
  techName: string;
  /** Aciona o fluxo de finalização que vive no cartão da próxima visita. */
  onFinishRequest: () => void;
  /** Muda quando o indicador do cartão pede para abrir as armadilhas. */
  openTrapsSignal?: number;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ActionKey | null>(null);
  const trapCount = useTrapsStore((s) => s.traps.filter((t) => t.customerId === appt.customerId).length);

  useEffect(() => { if (openTrapsSignal > 0) setAction('armadilhas'); }, [openTrapsSignal]);

  const item = (key: ActionKey, icon: React.ReactNode, label: string, badge?: number) => (
    <button
      type="button"
      onClick={() => { setAction(key); setOpen(false); }}
      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-muted"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge != null && <Badge tone="brand" className="text-[10px]">{badge}</Badge>}
    </button>
  );

  return (
    <>
      <div className="relative">
        <Button variant="outline" size="sm" leftIcon={<Settings2 size={14} />} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          Gerenciar
        </Button>
        {open && (
          <>
            {/* Clique fora fecha o menu. */}
            <div
              role="button" tabIndex={-1} aria-label="Fechar menu"
              className="fixed inset-0 z-30 cursor-default"
              onClick={() => setOpen(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
            />
            <div className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-card">
              <button
                type="button"
                onClick={() => { onFinishRequest(); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-foreground transition hover:bg-muted"
              >
                <span className="text-brand"><CheckCircle2 size={15} /></span>Fechar ordem de serviço
              </button>
              {item('servicos', <ClipboardList size={15} />, 'Serviços a executar')}
              {item('armadilhas', <Radar size={15} />, 'Monitorar armadilhas', trapCount || undefined)}
              {item('nao_conformidade', <TriangleAlert size={15} />, 'Informar não conformidades')}
              {item('verificacao', <ClipboardCheck size={15} />, 'Monitoramento/verificação')}
              {item('assinar', <PenLine size={15} />, 'Capturar assinatura')}
              {item('ver_assinatura', <Eye size={15} />, 'Visualizar assinatura')}
            </div>
          </>
        )}
      </div>

      <ServicosDrawer open={action === 'servicos'} onClose={() => setAction(null)} appt={appt} />
      <ArmadilhasDrawer open={action === 'armadilhas'} onClose={() => setAction(null)} appt={appt} techId={techId} />
      <NaoConformidadeDrawer open={action === 'nao_conformidade'} onClose={() => setAction(null)} appt={appt} techId={techId} />
      <VerificacaoDrawer open={action === 'verificacao'} onClose={() => setAction(null)} appt={appt} />
      <AssinaturasDrawer
        open={action === 'assinar' || action === 'ver_assinatura'}
        readOnly={action === 'ver_assinatura'}
        onClose={() => setAction(null)}
        appt={appt}
        techId={techId}
        techName={techName}
      />
    </>
  );
}

// ── 1. Serviços a executar ────────────────────────────────────────────────

function ServicosDrawer({ open, onClose, appt }: { open: boolean; onClose: () => void; appt: Appointment }) {
  const os = serviceOrderForAppointment(appt.id);
  const areas = useAreasStore((s) => s.items);
  const serviceIds = useMemo(() => {
    const ids = [...(os?.serviceTypeIds ?? [])];
    const main = os?.serviceTypeId ?? appt.serviceTypeId;
    if (main && !ids.includes(main)) ids.unshift(main);
    return ids;
  }, [os, appt.serviceTypeId]);
  const planned = appt.products?.length
    ? appt.products.map((p) => ({ productId: p.productId, qty: p.plannedQty }))
    : (getServiceType(appt.serviceTypeId)?.defaultProducts ?? []);

  return (
    <Drawer open={open} onClose={onClose} title="Serviços a executar" subtitle={getCustomer(appt.customerId)?.name}>
      <div className="space-y-5">
        <Bloco title="Serviços">
          {serviceIds.length === 0 ? <Vazio>Nenhum serviço informado na OS.</Vazio> : (
            <div className="space-y-1.5">
              {serviceIds.map((id) => {
                const st = getServiceType(id);
                return (
                  <div key={id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <span className="font-medium text-foreground">{st?.name ?? id}</span>
                    {st?.defaultDurationMin && <Badge tone="neutral">{st.defaultDurationMin} min</Badge>}
                  </div>
                );
              })}
            </div>
          )}
        </Bloco>

        <Bloco title="Pragas alvo">
          {(os?.pestIds ?? []).length === 0 ? <Vazio>Nenhuma praga informada.</Vazio> : (
            <div className="flex flex-wrap gap-1.5">
              {(os?.pestIds ?? []).map((id) => (
                <Badge key={id} tone="brand"><Bug size={11} className="mr-1" />{getPest(id)?.name ?? id}</Badge>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco title="Áreas a tratar">
          {(os?.areaIds ?? []).length === 0 && !os?.areaTreated ? <Vazio>Nenhuma área informada.</Vazio> : (
            <div className="space-y-2">
              {(os?.areaIds ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(os?.areaIds ?? []).map((id) => (
                    <Badge key={id} tone="neutral">{areas.find((a) => a.id === id)?.name ?? id}</Badge>
                  ))}
                </div>
              )}
              {os?.areaTreated && <p className="text-sm text-foreground">{os.areaTreated}</p>}
            </div>
          )}
        </Bloco>

        <Bloco title="Produtos previstos">
          {planned.length === 0 ? <Vazio>Sem produtos padrão para este serviço.</Vazio> : (
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
        </Bloco>

        {os?.procedures && <Bloco title="Procedimentos"><p className="text-sm text-foreground">{os.procedures}</p></Bloco>}
        {os?.technicianMessage && (
          <div className="rounded-lg border border-brand/30 bg-brand-soft/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Mensagem para o técnico</p>
            <p className="mt-0.5 text-sm text-foreground">{os.technicianMessage}</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}

// ── 2. Monitorar armadilhas ───────────────────────────────────────────────

function ArmadilhasDrawer({ open, onClose, appt, techId }: {
  open: boolean; onClose: () => void; appt: Appointment; techId: string;
}) {
  const traps = useTrapsStore((s) => s.traps.filter((t) => t.customerId === appt.customerId));
  const inspections = useTrapsStore((s) => s.inspections);
  const addInspection = useTrapsStore((s) => s.addInspection);
  const addTrap = useTrapsStore((s) => s.addTrap);
  const trapTypes = useTrapTypesStore((s) => s.items.filter((t) => t.isActive !== false));
  const [selected, setSelected] = useState<TrapDevice | null>(null);
  const [view, setView] = useState<'lista' | 'mapa'>('lista');
  /** Instalar aqui, no dia: quem coloca a armadilha é quem sabe o código que
   *  colou nela e em que ponto ela ficou. Cadastrar depois, no escritório,
   *  significa alguém transcrevendo de memória ou de um papel. */
  const [instalando, setInstalando] = useState(false);

  useEffect(() => { if (!open) { setSelected(null); setView('lista'); setInstalando(false); } }, [open]);

  const lastOf = (trapId: string) =>
    inspections.filter((i) => i.trapId === trapId).sort((a, b) => b.date.localeCompare(a.date))[0];

  // Só as armadilhas deste cliente entram no mapa, e só as que têm posição
  // registrada — sem coordenadas, a lista por ponto de instalação é o que o
  // técnico tem para se localizar.
  const comCoordenadas = traps.filter((t) => t.latitude != null && t.longitude != null);

  return (
    <Drawer open={open} onClose={onClose} title="Monitorar armadilhas" subtitle={getCustomer(appt.customerId)?.name}>
      {instalando ? (
        <InstalarArmadilhaForm
          tipos={trapTypes.map((t) => t.name)}
          onCancel={() => setInstalando(false)}
          onSave={(dados) => {
            const nova = addTrap({
              customerId: appt.customerId,
              code: dados.code,
              type: dados.type,
              location: dados.location || undefined,
              installedAt: new Date().toISOString(),
              responsibleId: techId,
            });
            logChange('criação', 'monitoramento', `Armadilha ${nova.code} instalada em ${dados.location || 'local não informado'}`, nova.id);
            toast(`${nova.code} instalada.`, { tone: 'success' });
            setInstalando(false);
          }}
        />
      ) : selected ? (
        <InspecaoForm
          trap={selected}
          onCancel={() => setSelected(null)}
          onSave={(data) => {
            addInspection({ trapId: selected.id, date: new Date().toISOString(), technicianId: techId, ...data });
            logChange('criação', 'monitoramento', `Inspeção da armadilha ${selected.code}${data.consumed ? ' · com consumo' : ''}`, selected.id);
            toast('Inspeção registrada.', { tone: 'success' });
            setSelected(null);
          }}
        />
      ) : (
        <div className="space-y-3">
          <Button size="sm" variant="outline" leftIcon={<Plus size={14} />} onClick={() => setInstalando(true)} className="w-full">
            Instalar armadilha aqui
          </Button>

          {traps.length === 0 && <Vazio>Este cliente ainda não tem armadilhas. Instale a primeira pelo botão acima.</Vazio>}

          {traps.length > 0 && comCoordenadas.length > 0 && (
            <Segmented
              size="sm"
              value={view}
              onChange={(v) => setView(v as 'lista' | 'mapa')}
              options={[
                { value: 'lista', label: 'Lista' },
                { value: 'mapa', label: `Mapa (${comCoordenadas.length})` },
              ]}
            />
          )}

          {view === 'mapa' && comCoordenadas.length > 0 && (
            <TrapsMap traps={comCoordenadas} onSelect={setSelected} lastOf={lastOf} />
          )}

          {view === 'lista' && traps.map((t) => {
            const last = lastOf(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition hover:bg-muted/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-brand"><Radar size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{t.code}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.type}{t.location ? ` · ${t.location}` : ''}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {last ? `Última inspeção ${fmtDate(last.date)}${last.consumed ? ' · houve consumo' : ''}` : 'Nunca inspecionada'}
                  </span>
                </span>
                {last?.consumed && <Badge tone="warning" className="text-[10px]">Consumo</Badge>}
              </button>
            );
          })}

          {traps.length > 0 && comCoordenadas.length === 0 && (
            <p className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              As armadilhas deste cliente ainda não têm posição registrada, então não há mapa —
              use o ponto de instalação de cada uma para se localizar. O escritório pode registrar a
              posição no cadastro de armadilhas do cliente.
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}

/**
 * Mapa das armadilhas do cliente, em SVG — mesma projeção do mapa de rota
 * (`lib/geo.ts`), sem depender de tiles externos (o CSP bloqueia hosts de
 * fora, ver vercel.json). Toque num marcador abre a inspeção daquela
 * armadilha.
 */
function TrapsMap({ traps, onSelect, lastOf }: {
  traps: TrapDevice[];
  onSelect: (t: TrapDevice) => void;
  lastOf: (trapId: string) => { consumed: boolean; date: string } | undefined;
}) {
  const W = 320;
  const H = 240;
  const pontos = projectPoints(
    traps.map((t) => ({ lat: t.latitude as number, lng: t.longitude as number, trap: t })),
    W, H,
  );

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Mapa das armadilhas · ${traps.length} pontos`}>
        <rect x={0} y={0} width={W} height={H} rx={10} fill="rgb(var(--color-muted))" />
        {pontos.map((p) => {
          const ultima = lastOf(p.trap.id);
          const cor = ultima?.consumed ? 'rgb(var(--color-warning))' : 'rgb(var(--color-brand))';
          return (
            <g
              key={p.trap.id}
              role="button"
              tabIndex={0}
              aria-label={`Armadilha ${p.trap.code}${p.trap.location ? ` em ${p.trap.location}` : ''}`}
              onClick={() => onSelect(p.trap)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.trap); } }}
              className="cursor-pointer"
            >
              <circle cx={p.x} cy={p.y} r={9} fill={cor} opacity={0.9} />
              <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">
                {p.trap.code.replace(/\D/g, '').slice(-2) || '•'}
              </text>
              <text x={p.x} y={p.y + 22} textAnchor="middle" fontSize={8} fill="rgb(var(--color-muted-foreground))">
                {p.trap.code}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 px-1 text-[11px] text-muted-foreground">
        Toque num ponto para registrar a inspeção. Laranja = houve consumo na última visita.
      </p>
    </div>
  );
}

type InspecaoDraft = { consumed: boolean; action?: 'nenhuma' | 'substituida' | 'retirada' | 'reinstalada' | 'extraviada'; notes?: string };

function InspecaoForm({ trap, onCancel, onSave }: {
  trap: TrapDevice; onCancel: () => void; onSave: (d: InspecaoDraft) => void;
}) {
  const [consumed, setConsumed] = useState(false);
  const [action, setAction] = useState<NonNullable<InspecaoDraft['action']>>('nenhuma');
  const [notes, setNotes] = useState('');

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <p className="text-sm font-semibold text-foreground">{trap.code}</p>
        <p className="text-xs text-muted-foreground">{trap.type}{trap.location ? ` · ${trap.location}` : ''}</p>
      </div>

      <Field label="Houve consumo / captura?">
        <Segmented
          value={consumed ? 'sim' : 'nao'}
          onChange={(v) => setConsumed(v === 'sim')}
          options={[{ value: 'nao', label: 'Não' }, { value: 'sim', label: 'Sim' }]}
        />
      </Field>

      <Field label="Ação tomada">
        <Select value={action} onChange={(e) => setAction(e.target.value as NonNullable<InspecaoDraft['action']>)}>
          <option value="nenhuma">Nenhuma</option>
          <option value="substituida">Substituída</option>
          <option value="retirada">Retirada</option>
          <option value="reinstalada">Reinstalada</option>
          <option value="extraviada">Extraviada</option>
        </Select>
      </Field>

      <Field label="Observação">
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que você encontrou nesta armadilha…" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onCancel}>Voltar</Button>
        <Button leftIcon={<CheckCircle2 size={15} />} onClick={() => onSave({ consumed, action, notes: notes.trim() || undefined })}>
          Registrar inspeção
        </Button>
      </div>
    </div>
  );
}

/**
 * Instalação de armadilha em campo.
 *
 * Pede só o que quem está no local sabe e o escritório não tem como saber: o
 * código colado no dispositivo e onde ele ficou. Data de instalação é hoje —
 * é a instalação acontecendo — e o responsável é o técnico que está ali.
 */
function InstalarArmadilhaForm({ tipos, onCancel, onSave }: {
  tipos: string[];
  onCancel: () => void;
  onSave: (d: { code: string; type: string; location: string }) => void;
}) {
  const [code, setCode] = useState('');
  const [type, setType] = useState(tipos[0] ?? 'Porta-isca');
  const [location, setLocation] = useState('');

  const salvar = () => {
    if (!code.trim()) { toast('Informe o código da armadilha (ex.: Porta Isca 001).', { tone: 'warning' }); return; }
    if (!location.trim()) { toast('Informe o local de instalação (ex.: Área da lixeira).', { tone: 'warning' }); return; }
    onSave({ code: code.trim(), type, location: location.trim() });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Registre a armadilha no momento em que instalar — o código e o ponto ficam gravados
        com a data de hoje e no seu nome.
      </p>
      <Field label="Código" required>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: Porta Isca 001" />
      </Field>
      <Field label="Tipo" required>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Local de instalação" required>
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Área da lixeira" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button leftIcon={<CheckCircle2 size={15} />} onClick={salvar}>Instalar</Button>
      </div>
    </div>
  );
}

// ── 3. Informar não conformidades ─────────────────────────────────────────

function NaoConformidadeDrawer({ open, onClose, appt, techId }: {
  open: boolean; onClose: () => void; appt: Appointment; techId: string;
}) {
  const add = useNonConformitiesStore((s) => s.add);
  const [category, setCategory] = useState<NonConformity['category']>('fresta');
  const [priority, setPriority] = useState<AppointmentPriority>('normal');
  const [description, setDescription] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) { setCategory('fresta'); setPriority('normal'); setDescription(''); setCorrectiveAction(''); setTouched(false); }
  }, [open]);

  const submit = () => {
    setTouched(true);
    if (!description.trim()) return;
    add({
      id: uid('nc'),
      orgId: currentOrgId(),
      customerId: appt.customerId,
      date: new Date().toISOString(),
      category,
      description: description.trim(),
      priority,
      correctiveAction: correctiveAction.trim() || undefined,
      status: 'aberta',
      createdBy: techId,
      createdAt: new Date().toISOString(),
    });
    logChange('criação', 'não conformidade', `${NC_CATEGORY_LABEL[category]} · ${getCustomer(appt.customerId)?.name ?? ''} (registrada em campo)`);
    toast('Não conformidade registrada e enviada para o escritório.', { tone: 'success' });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Informar não conformidade"
      subtitle={getCustomer(appt.customerId)?.name}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button leftIcon={<CheckCircle2 size={15} />} onClick={submit}>Registrar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Tipo">
          <Select value={category} onChange={(e) => setCategory(e.target.value as NonConformity['category'])}>
            {(Object.keys(NC_CATEGORY_LABEL) as NonConformity['category'][]).map((c) => (
              <option key={c} value={c}>{NC_CATEGORY_LABEL[c]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Prioridade">
          <Segmented
            size="sm"
            value={priority}
            onChange={(v) => setPriority(v as AppointmentPriority)}
            options={[
              { value: 'baixa', label: 'Baixa' }, { value: 'normal', label: 'Normal' },
              { value: 'alta', label: 'Alta' }, { value: 'urgente', label: 'Urgente' },
            ]}
          />
        </Field>
        <Field label="O que foi encontrado" required>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva o problema e onde ele está…" />
          {touched && !description.trim() && <span className="mt-1 block text-xs text-danger">Descreva a não conformidade.</span>}
        </Field>
        <Field label="Ação corretiva sugerida">
          <Textarea rows={3} value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} placeholder="O que o cliente precisa providenciar…" />
        </Field>
      </div>
    </Drawer>
  );
}

// ── 4. Monitoramento / verificação ────────────────────────────────────────

function VerificacaoDrawer({ open, onClose, appt }: {
  open: boolean; onClose: () => void; appt: Appointment;
}) {
  const updateAppt = useAppointmentsStore((s) => s.update);
  const areas = useAreasStore((s) => s.items);
  const inspections = useTrapsStore((s) => s.inspections);
  const traps = useTrapsStore((s) => s.traps);
  const ncs = useNonConformitiesStore((s) => s.items);
  const os = serviceOrderForAppointment(appt.id);
  const customer = getCustomer(appt.customerId);

  /** Pontos a conferir: as áreas da OS, a estrutura cadastrada do cliente e,
   *  se não houver nenhuma das duas, a lista padrão. */
  const pontos = useMemo(() => {
    const daOs = (os?.areaIds ?? []).map((id) => areas.find((a) => a.id === id)?.name).filter(Boolean) as string[];
    const doCliente = customer?.localStructure ?? [];
    const juntos = [...new Set([...daOs, ...doCliente])];
    return juntos.length ? juntos : PONTOS_PADRAO;
  }, [os, areas, customer]);

  const [items, setItems] = useState<VerificationItem[]>([]);
  useEffect(() => {
    if (!open) return;
    const salvos = appt.verification ?? [];
    setItems(pontos.map((point) => salvos.find((v) => v.point === point) ?? { point, result: 'conforme' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appt.id]);

  const setItem = (i: number, patch: Partial<VerificationItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  // ── Conferência do que já foi registrado nesta visita ──────────────────
  const hoje = localDayKey();
  const trapIdsDoCliente = new Set(traps.filter((t) => t.customerId === appt.customerId).map((t) => t.id));
  const inspecionadasHoje = inspections.filter((i) => trapIdsDoCliente.has(i.trapId) && localDayKey(i.date) === hoje);
  const comConsumo = inspecionadasHoje.filter((i) => i.consumed).length;
  const ncsAbertas = ncs.filter((n) => n.customerId === appt.customerId && n.status !== 'resolvida').length;
  const naoConformes = items.filter((i) => i.result === 'nao_conforme').length;

  const salvar = () => {
    updateAppt(appt.id, { verification: items });
    logChange('alteração', 'monitoramento', `Verificação do local registrada · ${customer?.name ?? ''}${naoConformes ? ` · ${naoConformes} ponto(s) não conforme(s)` : ''}`, appt.id);
    toast('Verificação salva no sistema.', { tone: 'success' });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Monitoramento / verificação"
      subtitle={customer?.name}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button leftIcon={<CheckCircle2 size={15} />} onClick={salvar}>Salvar verificação</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Bloco title="Checklist do local">
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={it.point} className="rounded-xl border border-border p-3">
                <p className="mb-2 text-sm font-medium text-foreground">{it.point}</p>
                <Segmented
                  size="sm"
                  value={it.result}
                  onChange={(v) => setItem(i, { result: v as VerificationItem['result'] })}
                  options={[
                    { value: 'conforme', label: 'Conforme' },
                    { value: 'nao_conforme', label: 'Não conforme' },
                    { value: 'nao_aplica', label: 'N/A' },
                  ]}
                />
                {it.result === 'nao_conforme' && (
                  <Input
                    className="mt-2"
                    value={it.notes ?? ''}
                    onChange={(e) => setItem(i, { notes: e.target.value })}
                    placeholder="O que está errado neste ponto?"
                    aria-label={`Observação de ${it.point}`}
                  />
                )}
              </div>
            ))}
          </div>
          {naoConformes > 0 && (
            <p className="mt-2 rounded-lg border border-warning/30 bg-warning-soft/50 p-2.5 text-xs text-foreground">
              {naoConformes} ponto(s) fora do padrão. Registre o que for responsabilidade do cliente em
              <span className="font-medium"> Informar não conformidades</span>, para o escritório cobrar a correção.
            </p>
          )}
        </Bloco>

        <Bloco title="Conferência antes de fechar a OS">
          <div className="grid grid-cols-2 gap-2">
            <Confere label="Armadilhas inspecionadas hoje" value={`${inspecionadasHoje.length} de ${trapIdsDoCliente.size}`} alerta={trapIdsDoCliente.size > 0 && inspecionadasHoje.length === 0} />
            <Confere label="Com consumo/captura" value={String(comConsumo)} alerta={comConsumo > 0} />
            <Confere label="Não conformidades abertas" value={String(ncsAbertas)} alerta={ncsAbertas > 0} />
            <Confere label="Assinatura do cliente" value={appt.customerSignature ? 'Colhida' : 'Pendente'} alerta={!appt.customerSignature} />
            <Confere label="Assinatura do técnico" value={appt.technicianSignature ? 'Colhida' : 'Pendente'} alerta={!appt.technicianSignature} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Os itens em laranja não impedem fechar a OS — são só o que ainda falta ou merece atenção.
          </p>
        </Bloco>

        {appt.status === 'finalizado' && (
          <p className="text-[11px] text-muted-foreground">
            Esta visita já foi finalizada — a verificação continua editável para correção.
          </p>
        )}
      </div>
    </Drawer>
  );
}

function Confere({ label, value, alerta }: { label: string; value: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${alerta ? 'border-warning/40 bg-warning-soft/40' : 'border-border bg-muted/40'}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

// ── 5 e 6. Capturar / visualizar assinatura ───────────────────────────────

function AssinaturasDrawer({ open, readOnly, onClose, appt, techId, techName }: {
  open: boolean; readOnly: boolean; onClose: () => void; appt: Appointment; techId: string; techName: string;
}) {
  const updateAppt = useAppointmentsStore((s) => s.update);
  const updateOs = useServiceOrdersStore((s) => s.update);
  const storedSig = useSettingsStore((s) => s.signatures[techId]);
  const os = serviceOrderForAppointment(appt.id);
  const customer = getCustomer(appt.customerId);
  const [customerSignature, setCustomerSignature] = useState<string | undefined>();
  const [signer, setSigner] = useState<SignerInfo>({});
  // A do técnico não é desenhada aqui: vem do cadastro dele. Só é exibida.
  const technicianSignature = appt.technicianSignature ?? storedSig;

  useEffect(() => {
    if (!open) return;
    setCustomerSignature(appt.customerSignature ?? os?.customerSignature);
    setSigner(signerOf(appt, os));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appt.id]);

  const salvar = () => {
    // Assinatura sem nome e documento não identifica ninguém — é justamente o
    // que o documento precisa provar. Só cobra quando há assinatura para salvar.
    if (customerSignature) {
      const falta = signerMissing(signer);
      if (falta) { toast(falta, { tone: 'warning' }); return; }
    }
    updateAppt(appt.id, { customerSignature, technicianSignature, ...signer });
    // A OS é o que vira PDF — a assinatura precisa chegar nela também.
    if (os) applySignaturesToOs(updateOs, os, { customerSignature, technicianSignature, ...signer });
    toast('Assinaturas salvas.', { tone: 'success' });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={readOnly ? 'Assinaturas do atendimento' : 'Capturar assinatura do cliente'}
      subtitle={customer?.name}
      footer={readOnly ? undefined : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button leftIcon={<CheckCircle2 size={15} />} onClick={salvar}>Salvar assinaturas</Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Cliente {customer?.name ? `· ${customer.name}` : ''}
          </p>
          {readOnly ? (
            <>
              <AssinaturaLida src={customerSignature} vazio="O cliente ainda não assinou." />
              <div className="mt-2"><SignerSummary info={signer} /></div>
            </>
          ) : (
            <>
              <SignaturePad key={`cli-${appt.id}`} value={customerSignature} onChange={setCustomerSignature} height={140} label="Assinatura do cliente" />
              <div className="mt-3">
                <SignerFields value={signer} onChange={setSigner} customerName={customer?.name} />
              </div>
            </>
          )}
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Técnico · {techName}</p>
          <AssinaturaLida
            src={technicianSignature}
            vazio="Você ainda não tem assinatura cadastrada. Peça ao escritório para registrá-la no seu perfil — ela é usada automaticamente em todos os atendimentos."
          />
        </div>
        {!readOnly && (
          <p className="text-xs text-muted-foreground">
            Só a assinatura do cliente é colhida no atendimento. A sua vem do seu cadastro e já entra
            na Ordem de Serviço e no PDF entregue ao cliente.
          </p>
        )}
      </div>
    </Drawer>
  );
}

/** Grava as assinaturas na OS, mantendo `hasCustomerSignature` coerente.
 *  Leva junto quem assinou — é esse nome que sai no PDF, não o do cadastro. */
function applySignaturesToOs(
  updateOs: (id: string, patch: Partial<ServiceOrder>) => void,
  os: ServiceOrder,
  sig: { customerSignature?: string; technicianSignature?: string } & SignerInfo,
) {
  updateOs(os.id, {
    customerSignature: sig.customerSignature,
    technicianSignature: sig.technicianSignature,
    hasCustomerSignature: !!sig.customerSignature,
    signerName: sig.signerName,
    signerDocType: sig.signerDocType,
    signerDocument: sig.signerDocument,
  });
}

/** Dados de quem assinou, preferindo o que já foi registrado na visita e
 *  caindo para a OS (a mesma assinatura vive nos dois lugares). */
function signerOf(appt: Appointment, os?: ServiceOrder): SignerInfo {
  return {
    signerName: appt.signerName ?? os?.signerName,
    signerDocType: appt.signerDocType ?? os?.signerDocType ?? 'cpf',
    signerDocument: appt.signerDocument ?? os?.signerDocument,
  };
}

function AssinaturaLida({ src, vazio }: { src?: string; vazio: string }) {
  if (!src) return <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{vazio}</p>;
  return (
    <div className="rounded-xl border border-border bg-surface p-2">
      <img src={src} alt="Assinatura capturada" className="mx-auto max-h-36" />
    </div>
  );
}

// ── auxiliares ────────────────────────────────────────────────────────────

function Bloco({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{title}</p>
      {children}
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
