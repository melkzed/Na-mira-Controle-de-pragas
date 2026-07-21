import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ClipboardList, FileText, MapPin, Plus, Radar, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { StatCard } from '../components/StatCard';
import { Stagger } from '../components/ui/misc';
import { useCustomersStore } from '@/store/customersStore';
import { useTrapsStore, type TrapInput } from '@/store/trapsStore';
import { logChange } from '@/store/auditStore';
import { technicians } from '@/infrastructure/seed/data';
import type { TrapDevice, TrapStatus } from '@/domain/types';
import { fmtDate } from '@/lib/date';
import { printMipReport, printTrapReport } from '@/lib/printReports';

const STATUS_META: Record<TrapStatus, { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  ativa: { label: 'Ativa', tone: 'success' },
  extraviada: { label: 'Extraviada', tone: 'danger' },
  substituida: { label: 'Substituída', tone: 'warning' },
  retirada: { label: 'Retirada', tone: 'neutral' },
};

export function MonitoramentoPage() {
  const [params, setParams] = useSearchParams();
  const customers = useCustomersStore((s) => s.customers);
  const { traps, inspections, addTrap, removeTrap, addInspection } = useTrapsStore();

  const monitored = customers.filter((c) => c.monitoringContracted);
  const [customerId, setCustomerId] = useState(params.get('client') ?? monitored[0]?.id ?? '');
  const customer = customers.find((c) => c.id === customerId);
  useEffect(() => { setParams(customerId ? { client: customerId } : {}, { replace: true }); }, [customerId, setParams]);

  const custTraps = useMemo(() => traps.filter((t) => t.customerId === customerId), [traps, customerId]);
  const lastInsp = (trapId: string) => inspections.filter((i) => i.trapId === trapId).sort((a, b) => (a.date > b.date ? -1 : 1))[0];
  const withConsumption = custTraps.filter((t) => lastInsp(t.id)?.consumed).length;
  const rate = custTraps.length ? Math.round((withConsumption / custTraps.length) * 100) : 0;

  const [formOpen, setFormOpen] = useState(false);
  const [inspectTrap, setInspectTrap] = useState<TrapDevice | null>(null);

  if (monitored.length === 0) {
    return (
      <div>
        <PageHeader title="Monitoramento" description="Armadilhas e MIP" />
        <Card><CardBody className="py-16 text-center">
          <Radar size={28} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nenhum cliente com monitoramento contratado</p>
          <p className="mt-1 text-sm text-muted-foreground">Ative "Monitoramento contratado" no cadastro do cliente para habilitar armadilhas e MIP.</p>
        </CardBody></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Monitoramento de Armadilhas"
        description="Controle de dispositivos, inspeções e MIP dos clientes com monitoramento"
        actions={
          <>
            <Button variant="outline" leftIcon={<FileText size={16} />} onClick={() => customer && printMipReport(customer, custTraps, inspections)}>Relatório MIP</Button>
            <Button variant="outline" leftIcon={<FileText size={16} />} onClick={() => customer && printTrapReport(customer, custTraps, inspections)}>Rel. Armadilhas</Button>
            <Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Nova armadilha</Button>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Cliente:</span>
        <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="sm:max-w-xs">
          {monitored.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Armadilhas" value={custTraps.length} icon="Radar" tone="brand" />
        <StatCard label="Com consumo" value={withConsumption} icon="TriangleAlert" tone="warning" />
        <StatCard label="Taxa de consumo" value={rate} icon="Percent" tone="danger" format={(n) => `${Math.round(n)}%`} />
        <StatCard label="Inspeções (hist.)" value={inspections.filter((i) => custTraps.some((t) => t.id === i.trapId)).length} icon="ClipboardCheck" tone="info" />
      </Stagger>

      <Card className="mt-6">
        <CardHeader title="Dispositivos monitorados" subtitle={`${custTraps.length} armadilhas`} />
        <CardBody className="space-y-2">
          {custTraps.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma armadilha cadastrada para este cliente.</p>}
          {custTraps.map((t) => {
            const li = lastInsp(t.id);
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><Radar size={18} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{t.code}</p>
                  <p className="truncate text-xs text-muted-foreground"><MapPin size={11} className="mr-1 inline" />{t.type}{t.location ? ` · ${t.location}` : ''}</p>
                </div>
                {li && <Badge tone={li.consumed ? 'danger' : 'success'} dot>{li.consumed ? 'Consumo' : 'Sem consumo'} · {fmtDate(li.date)}</Badge>}
                <Badge tone={STATUS_META[t.status].tone}>{STATUS_META[t.status].label}</Badge>
                <Button size="sm" variant="outline" leftIcon={<ClipboardList size={14} />} onClick={() => setInspectTrap(t)}>Inspeção</Button>
                <button onClick={() => removeTrap(t.id)} className="text-muted-foreground hover:text-danger" title="Excluir"><Trash2 size={15} /></button>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <TrapForm open={formOpen} onClose={() => setFormOpen(false)} onSave={(input) => { addTrap({ ...input, customerId }); logChange('criação', 'armadilha', `${input.code} · ${customer?.name ?? ''}`); setFormOpen(false); }} />
      <InspectionForm trap={inspectTrap} onClose={() => setInspectTrap(null)} onSave={(data) => { const t = inspectTrap; addInspection(data); logChange('inspeção', 'armadilha', `${t?.code ?? ''} · ${data.consumed ? 'consumo' : 'sem consumo'}${data.action && data.action !== 'nenhuma' ? ` · ${data.action}` : ''}`, t?.id); setInspectTrap(null); }} />
    </div>
  );
}

function TrapForm({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (t: Omit<TrapInput, 'customerId'>) => void }) {
  const [code, setCode] = useState('');
  const [type, setType] = useState('Porta-isca');
  const [location, setLocation] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setCode(''); setType('Porta-isca'); setLocation(''); setTouched(false); } }, [open]);

  const submit = () => { setTouched(true); if (!code.trim()) return; onSave({ code: code.trim(), type, location: location.trim() || undefined }); };

  return (
    <Drawer open={open} onClose={onClose} title="Nova armadilha" subtitle="Cadastro de dispositivo de monitoramento"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!code.trim()}>Adicionar</Button></div>}>
      <div className="space-y-4">
        <Field label="Identificação / numeração" required><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Porta Isca 005" />{touched && !code.trim() && <span className="mt-1 block text-xs text-danger">Informe a identificação.</span>}</Field>
        <Field label="Tipo"><Select value={type} onChange={(e) => setType(e.target.value)}>{['Porta-isca', 'Luminosa', 'Placa de cola', 'Mecânica', 'Feromônio', 'Ratoeira'].map((o) => <option key={o}>{o}</option>)}</Select></Field>
        <Field label="Local de instalação"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Garagem G1, Cozinha, Lixeira externa" /></Field>
      </div>
    </Drawer>
  );
}

function InspectionForm({ trap, onClose, onSave }: { trap: TrapDevice | null; onClose: () => void; onSave: (d: { trapId: string; date: string; consumed: boolean; action?: any; technicianId?: string; notes?: string }) => void }) {
  const [consumed, setConsumed] = useState(false);
  const [action, setAction] = useState<'nenhuma' | 'substituida' | 'retirada' | 'reinstalada' | 'extraviada'>('nenhuma');
  const [technicianId, setTechnicianId] = useState(technicians[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  useEffect(() => { if (trap) { setConsumed(false); setAction('nenhuma'); setTechnicianId(technicians[0]?.id ?? ''); setNotes(''); } }, [trap]);
  if (!trap) return null;

  const submit = () => onSave({ trapId: trap.id, date: new Date().toISOString(), consumed, action, technicianId, notes: notes.trim() || undefined });

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
        <Field label="Ocorrências / observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sinais de pragas, frestas, limpeza inadequada…" /></Field>
      </div>
    </Drawer>
  );
}
