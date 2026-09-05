import { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardList, History, MapPin, Plus, Radar, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Drawer } from '../ui/Drawer';
import { DateInput, Field, Input, Select, Textarea } from '../ui/Field';
import { StatCard } from '../StatCard';
import { Stagger } from '../ui/misc';
import { useTrapsStore, type TrapInput } from '@/store/trapsStore';
import { logChange } from '@/store/auditStore';
import { toast } from '@/store/toastStore';
import { useTrapTypesStore, useUsersStore } from '@/store/entityStores';
import type { TrapDevice } from '@/domain/types';
import { TRAP_STATUS_META } from '@/domain/trapMeta';
import { dateInputToIso, fmtDate } from '@/lib/date';
import { sortByName } from '@/lib/utils';

/** Painel de armadilhas/monitoramento de um cliente — usado tanto embutido no
 *  cadastro do cliente quanto na página standalone de Monitoramento. */
export function TrapsPanel({ customerId, compact = false }: { customerId: string; compact?: boolean }) {
  const { traps, inspections, addTrap, removeTrap, restoreTrap, addInspection } = useTrapsStore();
  const custTraps = useMemo(() => traps.filter((t) => t.customerId === customerId), [traps, customerId]);
  const lastInsp = (trapId: string) => inspections.filter((i) => i.trapId === trapId).sort((a, b) => (a.date > b.date ? -1 : 1))[0];
  const withConsumption = custTraps.filter((t) => lastInsp(t.id)?.consumed).length;
  const rate = custTraps.length ? Math.round((withConsumption / custTraps.length) * 100) : 0;

  const [formOpen, setFormOpen] = useState(false);
  const [inspectTrap, setInspectTrap] = useState<TrapDevice | null>(null);
  const [historyTrap, setHistoryTrap] = useState<TrapDevice | null>(null);

  const overdue = custTraps.filter((t) => t.nextInspectionAt && new Date(t.nextInspectionAt) < new Date()).length;

  return (
    <div>
      {!compact && (
        <Stagger className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Armadilhas" value={custTraps.length} icon="Radar" tone="brand" />
          <StatCard label="Com consumo" value={withConsumption} icon="TriangleAlert" tone="warning" />
          <StatCard label="Taxa de consumo" value={rate} icon="Percent" tone="danger" format={(n) => `${Math.round(n)}%`} />
          <StatCard label="Inspeção atrasada" value={overdue} icon="ClipboardCheck" tone="info" />
        </Stagger>
      )}

      <Card>
        <CardHeader title="Armadilhas monitoradas" subtitle={`${custTraps.length} dispositivo(s)`} action={<Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setFormOpen(true)}>Nova armadilha</Button>} />
        <CardBody className="space-y-2">
          {custTraps.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma armadilha cadastrada para este cliente.</p>}
          {custTraps.map((t) => {
            const li = lastInsp(t.id);
            const late = t.nextInspectionAt && new Date(t.nextInspectionAt) < new Date();
            return (
              <div key={t.id} className="rounded-xl border border-border/60 p-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><Radar size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{t.code}</p>
                    <p className="truncate text-xs text-muted-foreground"><MapPin size={11} className="mr-1 inline" />{t.type}{t.location ? ` · ${t.location}` : ''}</p>
                    {t.nextInspectionAt && <p className={`text-[11px] ${late ? 'text-danger' : 'text-muted-foreground'}`}>Próxima inspeção: {fmtDate(t.nextInspectionAt)}{late ? ' (atrasada)' : ''}</p>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-12">
                  {li && <Badge tone={li.consumed ? 'danger' : 'success'} dot>{li.consumed ? 'Consumo' : 'Sem consumo'} · {fmtDate(li.date)}</Badge>}
                  <Badge tone={TRAP_STATUS_META[t.status].tone}>{TRAP_STATUS_META[t.status].label}</Badge>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" leftIcon={<History size={14} />} onClick={() => setHistoryTrap(t)}>Histórico</Button>
                    <Button size="sm" variant="outline" leftIcon={<ClipboardList size={14} />} onClick={() => setInspectTrap(t)}>Inspeção</Button>
                    <button onClick={() => { removeTrap(t.id); toast(`Armadilha "${t.code}" excluída`, { tone: 'danger', action: { label: 'Desfazer', onClick: () => restoreTrap(t) } }); }} aria-label={`Excluir armadilha ${t.code}`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-danger" title="Excluir"><Trash2 size={15} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <TrapForm open={formOpen} onClose={() => setFormOpen(false)} onSave={(input) => { addTrap({ ...input, customerId }); logChange('criação', 'armadilha', `${input.code} · cliente`); setFormOpen(false); }} />
      <InspectionForm trap={inspectTrap} onClose={() => setInspectTrap(null)} onSave={(data, nextInspectionAt) => {
        const t = inspectTrap;
        addInspection(data);
        if (t && nextInspectionAt) useTrapsStore.getState().updateTrap(t.id, { nextInspectionAt: dateInputToIso(nextInspectionAt) });
        logChange('inspeção', 'armadilha', `${t?.code ?? ''} · ${data.consumed ? 'consumo' : 'sem consumo'}${data.action && data.action !== 'nenhuma' ? ` · ${data.action}` : ''}`, t?.id);
        setInspectTrap(null);
      }} />
      <HistoryDrawer trap={historyTrap} onClose={() => setHistoryTrap(null)} />
    </div>
  );
}

function TrapForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (t: Omit<TrapInput, 'customerId'>) => void }) {
  const technicians = useUsersStore((s) => sortByName(s.items.filter((u) => u.role === 'tecnico')));
  const trapTypes = useTrapTypesStore((s) => s.items.filter((t) => t.isActive !== false));
  const [code, setCode] = useState('');
  const [type, setType] = useState('');
  const [location, setLocation] = useState('');
  const [installedAt, setInstalledAt] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setCode(''); setType(trapTypes[0]?.name ?? ''); setLocation(''); setInstalledAt(''); setResponsibleId(technicians[0]?.id ?? ''); setTouched(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    setTouched(true);
    if (!code.trim()) return;
    onSave({
      code: code.trim(), type, location: location.trim() || undefined,
      installedAt: installedAt ? dateInputToIso(installedAt) : undefined,
      responsibleId: responsibleId || undefined,
    });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Nova armadilha" subtitle="Cadastro de dispositivo de monitoramento"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />}>Adicionar</Button></div>}>
      <div className="space-y-4">
        <Field label="Identificação / numeração" required><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Porta Isca 005" />{touched && !code.trim() && <span className="mt-1 block text-xs text-danger">Informe a identificação.</span>}</Field>
        <Field label="Tipo"><Select value={type} onChange={(e) => setType(e.target.value)}>{trapTypes.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}</Select></Field>
        <Field label="Local de instalação"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Garagem G1, Cozinha, Lixeira externa" /></Field>
        <Field label="Data de instalação"><DateInput type="date" value={installedAt} onChange={(e) => setInstalledAt(e.target.value)} /></Field>
        <Field label="Responsável fixo"><Select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}><option value="">—</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      </div>
    </Drawer>
  );
}

function InspectionForm({ trap, onClose, onSave }: {
  trap: TrapDevice | null;
  onClose: () => void;
  onSave: (d: { trapId: string; date: string; consumed: boolean; action?: 'nenhuma' | 'substituida' | 'retirada' | 'reinstalada' | 'extraviada'; technicianId?: string; notes?: string }, nextInspectionAt?: string) => void;
}) {
  const technicians = useUsersStore((s) => sortByName(s.items.filter((u) => u.role === 'tecnico')));
  const [consumed, setConsumed] = useState(false);
  const [action, setAction] = useState<'nenhuma' | 'substituida' | 'retirada' | 'reinstalada' | 'extraviada'>('nenhuma');
  const [technicianId, setTechnicianId] = useState(technicians[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [nextInspectionAt, setNextInspectionAt] = useState('');
  useEffect(() => { if (trap) { setConsumed(false); setAction('nenhuma'); setTechnicianId(technicians[0]?.id ?? ''); setNotes(''); setNextInspectionAt(''); } }, [trap]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!trap) return null;

  const submit = () => onSave({ trapId: trap.id, date: new Date().toISOString(), consumed, action, technicianId, notes: notes.trim() || undefined }, nextInspectionAt || undefined);

  return (
    <Drawer open={!!trap} onClose={onClose} title={`Inspeção · ${trap.code}`} subtitle={`${trap.type}${trap.location ? ` · ${trap.location}` : ''}`}
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />}>Registrar</Button></div>}>
      <div className="space-y-4">
        <Field label="Houve consumo?">
          <div className="flex gap-2">
            <Button variant={consumed ? 'primary' : 'outline'} className="flex-1" onClick={() => setConsumed(true)}>Sim</Button>
            <Button variant={!consumed ? 'primary' : 'outline'} className="flex-1" onClick={() => setConsumed(false)}>Não</Button>
          </div>
        </Field>
        <Field label="Ação realizada" hint="Extravio, substituição, retirada ou reinstalação atualizam a situação da armadilha.">
          <Select value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
            <option value="nenhuma">Nenhuma</option>
            <option value="substituida">Substituída</option>
            <option value="retirada">Retirada</option>
            <option value="reinstalada">Reinstalada</option>
            <option value="extraviada">Extraviada</option>
          </Select>
        </Field>
        <Field label="Técnico"><Select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Próxima inspeção prevista"><DateInput type="date" value={nextInspectionAt} onChange={(e) => setNextInspectionAt(e.target.value)} /></Field>
        <Field label="Ocorrências / observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sinais de pragas, frestas, limpeza inadequada…" /></Field>
      </div>
    </Drawer>
  );
}

/** Histórico completo de inspeções da armadilha — evolução ao longo do contrato. */
function HistoryDrawer({ trap, onClose }: { trap: TrapDevice | null; onClose: () => void }) {
  const inspections = useTrapsStore((s) => s.inspections.filter((i) => i.trapId === trap?.id).sort((a, b) => (a.date > b.date ? -1 : 1)));
  const technicians = useUsersStore((s) => s.items);
  if (!trap) return null;
  return (
    <Drawer open={!!trap} onClose={onClose} title={`Histórico · ${trap.code}`} subtitle={`${trap.type}${trap.location ? ` · ${trap.location}` : ''}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-border bg-muted/40 p-2"><p className="text-muted-foreground">Instalada em</p><p className="font-semibold text-foreground">{trap.installedAt ? fmtDate(trap.installedAt) : '—'}</p></div>
          <div className="rounded-lg border border-border bg-muted/40 p-2"><p className="text-muted-foreground">Responsável</p><p className="font-semibold text-foreground">{technicians.find((t) => t.id === trap.responsibleId)?.name ?? '—'}</p></div>
        </div>
        {inspections.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma inspeção registrada ainda.</p>}
        {inspections.map((i) => (
          <div key={i.id} className="rounded-lg border border-border/60 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">{fmtDate(i.date)}</span>
              <Badge tone={i.consumed ? 'danger' : 'success'}>{i.consumed ? 'Consumo' : 'Sem consumo'}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {technicians.find((t) => t.id === i.technicianId)?.name ?? '—'}
              {i.action && i.action !== 'nenhuma' ? ` · ${i.action}` : ''}
            </p>
            {i.notes && <p className="mt-1 text-xs text-foreground">{i.notes}</p>}
          </div>
        ))}
      </div>
    </Drawer>
  );
}
