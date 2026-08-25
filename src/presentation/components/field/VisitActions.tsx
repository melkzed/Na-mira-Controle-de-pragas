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
import {
  Bug, CheckCircle2, ClipboardCheck, ClipboardList, Eye, PenLine, Radar,
  Settings2, TriangleAlert,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { SignaturePad } from '../SignaturePad';
import { useAppointmentsStore } from '@/store/appointmentsStore';
import { useServiceOrdersStore } from '@/store/serviceOrdersStore';
import { useTrapsStore } from '@/store/trapsStore';
import { useNonConformitiesStore } from '@/store/entityStores';
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
import { fmtDate } from '@/lib/date';
import type {
  Appointment, NonConformity, ServiceOrder, TrapDevice, VerificationItem,
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

export function VisitActionsMenu({ appt, techId, techName, onFinishRequest }: {
  appt: Appointment;
  techId: string;
  techName: string;
  /** Aciona o fluxo de finalização que vive no cartão da próxima visita. */
  onFinishRequest: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ActionKey | null>(null);

  const item = (key: ActionKey, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => { setAction(key); setOpen(false); }}
      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-muted"
    >
      <span className="text-muted-foreground">{icon}</span>{label}
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
              {item('armadilhas', <Radar size={15} />, 'Monitorar armadilhas')}
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
  const [selected, setSelected] = useState<TrapDevice | null>(null);

  useEffect(() => { if (!open) setSelected(null); }, [open]);

  const lastOf = (trapId: string) =>
    inspections.filter((i) => i.trapId === trapId).sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <Drawer open={open} onClose={onClose} title="Monitorar armadilhas" subtitle={getCustomer(appt.customerId)?.name}>
      {selected ? (
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
        <div className="space-y-2">
          {traps.length === 0 && <Vazio>Este cliente não tem armadilhas cadastradas.</Vazio>}
          {traps.map((t) => {
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
        </div>
      )}
    </Drawer>
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
  const hoje = new Date().toISOString().slice(0, 10);
  const trapIdsDoCliente = new Set(traps.filter((t) => t.customerId === appt.customerId).map((t) => t.id));
  const inspecionadasHoje = inspections.filter((i) => trapIdsDoCliente.has(i.trapId) && i.date.slice(0, 10) === hoje);
  const comConsumo = inspecionadasHoje.filter((i) => i.consumed).length;
  const ncsAbertas = ncs.filter((n) => n.customerId === appt.customerId && n.status !== 'resolvida').length;
  const fotos = appt.photos?.length ?? 0;
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
            <Confere label="Fotos do atendimento" value={String(fotos)} alerta={fotos === 0} />
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
  const [technicianSignature, setTechnicianSignature] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    setCustomerSignature(appt.customerSignature ?? os?.customerSignature);
    setTechnicianSignature(appt.technicianSignature ?? storedSig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appt.id]);

  const salvar = () => {
    updateAppt(appt.id, { customerSignature, technicianSignature });
    // A OS é o que vira PDF — a assinatura precisa chegar nela também.
    if (os) applySignaturesToOs(updateOs, os, { customerSignature, technicianSignature });
    toast('Assinaturas salvas.', { tone: 'success' });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={readOnly ? 'Assinaturas do atendimento' : 'Capturar assinatura'}
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
            <AssinaturaLida src={customerSignature} vazio="O cliente ainda não assinou." />
          ) : (
            <SignaturePad key={`cli-${appt.id}`} value={customerSignature} onChange={setCustomerSignature} height={140} label="Assinatura do cliente" />
          )}
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Técnico · {techName}</p>
          {readOnly ? (
            <AssinaturaLida src={technicianSignature} vazio="Sem assinatura do técnico ainda." />
          ) : (
            <SignaturePad key={`tec-${appt.id}`} value={technicianSignature} onChange={setTechnicianSignature} height={140} label="Assinatura do técnico" />
          )}
        </div>
        {!readOnly && (
          <p className="text-xs text-muted-foreground">
            As assinaturas entram na Ordem de Serviço e saem no PDF entregue ao cliente.
          </p>
        )}
      </div>
    </Drawer>
  );
}

/** Grava as assinaturas na OS, mantendo `hasCustomerSignature` coerente. */
function applySignaturesToOs(
  updateOs: (id: string, patch: Partial<ServiceOrder>) => void,
  os: ServiceOrder,
  sig: { customerSignature?: string; technicianSignature?: string },
) {
  updateOs(os.id, {
    customerSignature: sig.customerSignature,
    technicianSignature: sig.technicianSignature,
    hasCustomerSignature: !!sig.customerSignature,
  });
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
