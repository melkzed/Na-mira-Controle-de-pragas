import { useEffect, useMemo, useState } from 'react';
import { Check, Download, Plus, Zap } from 'lucide-react';
import { PageHeader } from '../components/ui/misc';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Avatar } from '../components/ui/Avatar';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { Table, type Column } from '../components/ui/Table';
import { ServiceOrderStatusBadge } from '../components/StatusBadge';
import * as seed from '@/infrastructure/seed/data';
import { getCustomer, getProduct, getServiceType, getUser, lastOrderForCustomer } from '@/application/repository';
import type { Pest, ServiceOrder, ServiceType, TreatedArea } from '@/domain/types';
import type { RecurrenceFreq, ServiceOrderStatus, WarrantyType, WarrantyUnit } from '@/domain/enums';
import { PAYMENT_METHODS, RECURRENCE_FREQ_LABEL, WARRANTY_TYPE_LABEL } from '@/domain/enums';
import { fmtDate } from '@/lib/date';
import { downloadCsv } from '@/lib/export';
import { printServiceOrder } from '@/lib/printOrder';
import { printCertificate, printLaudo } from '@/lib/printDocuments';
import { currentBatch } from '@/lib/batches';
import { useInvoicesStore } from '@/store/invoicesStore';
import { useServiceOrdersStore, type ServiceOrderInput } from '@/store/serviceOrdersStore';
import { useCustomersStore } from '@/store/customersStore';
import { usePestsStore, useAreasStore, useEquipmentStore, useServiceTypesStore, useUsersStore } from '@/store/entityStores';
import { logChange } from '@/store/auditStore';
import { toast } from '@/store/toastStore';
import { PhotoCapture } from '../components/PhotoCapture';
import { SignaturePad } from '../components/SignaturePad';
import { QuickAddChip } from '../components/QuickAddChip';
import { Combobox, MultiCombobox } from '../components/ui/Combobox';
import { useSettingsStore } from '@/store/settingsStore';
import { computeTaxes } from '@/application/fiscal/tax';
import { formatCurrency } from '@/lib/utils';
import type { ServiceOrderPhoto } from '@/domain/types';
import { downloadNfseXml, printNfse } from '@/lib/printInvoice';
import { Award, FileCode, FileText, Receipt } from 'lucide-react';
import { uid } from '@/store/createEntityStore';

const OS_STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  rascunho: 'Rascunho', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada',
};

/** Chip de seleção rápida (toggle) — otimizado para OS rápida em campo. */
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-2.5 py-1 text-xs transition ${active ? 'border-brand bg-brand-soft text-brand' : 'border-border text-muted-foreground hover:bg-muted'}`}>{children}</button>
  );
}

export function OrdensPage() {
  const orders = useServiceOrdersStore((s) => s.orders);
  const [selected, setSelected] = useState<ServiceOrder | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const exportCsv = () => {
    downloadCsv('ordens-de-servico', orders, [
      { header: 'OS', value: (so) => so.number },
      { header: 'Cliente', value: (so) => getCustomer(so.customerId)?.name ?? '' },
      { header: 'Serviço', value: (so) => getServiceType(so.serviceTypeId)?.name ?? '' },
      { header: 'Técnico', value: (so) => getUser(so.technicianId)?.name ?? '' },
      { header: 'Status', value: (so) => so.status },
      { header: 'Duração (min)', value: (so) => so.totalMinutes ?? '' },
      { header: 'Criada em', value: (so) => fmtDate(so.createdAt) },
    ]);
  };

  const columns: Column<ServiceOrder>[] = [
    { key: 'num', header: 'OS', render: (so) => <span className="font-semibold">#{so.number}</span> },
    { key: 'cust', header: 'Cliente', render: (so) => getCustomer(so.customerId)?.name },
    { key: 'svc', header: 'Serviço', render: (so) => <Badge tone="neutral">{getServiceType(so.serviceTypeId)?.name}</Badge> },
    { key: 'tech', header: 'Técnico', render: (so) => {
      const t = getUser(so.technicianId);
      return t ? <div className="flex items-center gap-2"><Avatar name={t.name} size="xs" /><span className="text-muted-foreground">{t.name.split(' ')[0]}</span></div> : '—';
    } },
    { key: 'date', header: 'Data', render: (so) => fmtDate(so.createdAt) },
    { key: 'time', header: 'Duração', align: 'right', render: (so) => so.totalMinutes ? `${so.totalMinutes} min` : '—' },
    { key: 'status', header: 'Status', align: 'right', render: (so) => <ServiceOrderStatusBadge status={so.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Ordens de Serviço"
        description={`${orders.length} ordens registradas`}
        actions={
          <>
            <Button variant="outline" leftIcon={<Download size={16} />} onClick={exportCsv}>Exportar CSV</Button>
            <Button leftIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Nova OS</Button>
          </>
        }
      />
      <Table columns={columns} rows={orders} keyField={(so) => so.id} onRowClick={setSelected} />

      <NovaOsForm open={formOpen} onClose={() => setFormOpen(false)} onCreated={(so) => { setFormOpen(false); setSelected(so); }} />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Ordem de Serviço #${selected?.number}`}
        subtitle={selected ? getCustomer(selected.customerId)?.name : ''}
        width="max-w-xl"
        footer={<div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" leftIcon={<Download size={14} />} onClick={() => selected && printServiceOrder(selected)}>OS (PDF)</Button>
          <Button variant="outline" size="sm" leftIcon={<Award size={14} />} onClick={() => selected && printCertificate(selected)}>Certificado</Button>
          <Button variant="outline" size="sm" leftIcon={<FileText size={14} />} onClick={() => selected && printLaudo(selected)}>Laudo</Button>
        </div>}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-2"><ServiceOrderStatusBadge status={selected.status} /><Badge tone="neutral">{getServiceType(selected.serviceTypeId)?.name}</Badge></div>

            <Section title="Detalhes">
              <div className="grid grid-cols-2 gap-3">
                <Info label="Serviços" value={(selected.serviceTypeIds?.length ? selected.serviceTypeIds : [selected.serviceTypeId]).map((id) => getServiceType(id)?.name).filter(Boolean).join(', ') || '—'} />
                <Info label="Áreas tratadas" value={selected.areaTreated ?? '—'} />
                <Info label="Garantia" value={selected.warranty?.has ? `${selected.warranty.value ?? ''} ${selected.warranty.unit ?? ''}${selected.warranty.type ? ` · ${WARRANTY_TYPE_LABEL[selected.warranty.type]}` : ''}`.trim() : 'Sem garantia'} />
                <Info label="Recorrência" value={selected.recurrence?.enabled ? (selected.recurrence.frequency ? RECURRENCE_FREQ_LABEL[selected.recurrence.frequency] : 'Sim') : 'Não'} />
                <Info label="Forma de pagamento" value={selected.paymentMethod ?? '—'} />
                <Info label="Duração" value={selected.totalMinutes ? `${selected.totalMinutes} min` : 'em aberto'} />
                <Info label="Técnico(s)" value={(selected.technicianIds?.length ? selected.technicianIds : [selected.technicianId]).map((id) => getUser(id)?.name?.split(' ')[0]).filter(Boolean).join(', ') || '—'} />
                <Info label="Vendedor" value={selected.sellerId ? getUser(selected.sellerId)?.name ?? '—' : '—'} />
                <Info label="Execução" value={selected.executionDate ? fmtDate(selected.executionDate) : (selected.startedAt ? fmtDate(selected.startedAt) : '—')} />
                <Info label="Validade" value={selected.validityDate ? fmtDate(selected.validityDate) : '—'} />
              </div>
            </Section>

            {selected.procedures && <Section title="Procedimentos realizados"><p className="text-sm text-foreground">{selected.procedures}</p></Section>}

            <Section title="Pragas combatidas">
              <div className="flex flex-wrap gap-1.5">
                {selected.pestIds.map((id) => <Badge key={id} tone="warning">{seed.pests.find((p) => p.id === id)?.name}</Badge>)}
                {selected.pestIds.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
              </div>
            </Section>

            <Section title="Produtos utilizados">
              <div className="space-y-2">
                {selected.products.map((p) => {
                  const prod = getProduct(p.productId);
                  const batch = currentBatch(prod);
                  return (
                    <div key={p.productId} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                      <div>
                        <span className="text-sm text-foreground">{prod?.name}</span>
                        {batch && <p className="text-xs text-muted-foreground">Lote {batch.code}{batch.expiresAt ? ` · val. ${new Date(batch.expiresAt).toLocaleDateString('pt-BR')}` : ''}</p>}
                      </div>
                      <Badge tone="brand">{p.usedQty} {prod?.unit}</Badge>
                    </div>
                  );
                })}
                {selected.products.length === 0 && <span className="text-sm text-muted-foreground">Nenhum produto lançado.</span>}
              </div>
            </Section>

            <FiscalSection so={selected} />

            <OsSignatures so={selected} />
            <div className="rounded-lg border border-danger/20 bg-danger-soft/20 p-2.5 text-xs text-danger">
              <span className="font-semibold">Emergência (CIT):</span> {settingsEmergency()}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

/** Formulário de nova Ordem de Serviço — múltiplos serviços/pragas/áreas,
 *  garantia, recorrência, equipe, datas e sugestão automática de produtos. */
function NovaOsForm({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (so: ServiceOrder) => void }) {
  const add = useServiceOrdersStore((s) => s.add);
  const customers = useCustomersStore((s) => s.customers);
  const serviceTypes = useServiceTypesStore((s) => s.items);
  const addServiceType = useServiceTypesStore((s) => s.add);
  const pests = usePestsStore((s) => s.items);
  const addPest = usePestsStore((s) => s.add);
  const areas = useAreasStore((s) => s.items);
  const addArea = useAreasStore((s) => s.add);
  const equipment = useEquipmentStore((s) => s.items);
  const checkoutEquipment = useEquipmentStore((s) => s.update);
  const allStaffUsers = useUsersStore((s) => s.items);
  const technicianUsers = allStaffUsers.filter((u) => u.role === 'tecnico' && u.isActive);
  const sellers = allStaffUsers.filter((u) => u.role !== 'tecnico');

  const [customerId, setCustomerId] = useState('');
  const [serviceTypeIds, setServiceTypeIds] = useState<string[]>([]);
  const [technicianIds, setTechnicianIds] = useState<string[]>([]);
  const [sellerId, setSellerId] = useState('');
  const [status, setStatus] = useState<ServiceOrderStatus>('em_andamento');
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [pestIds, setPestIds] = useState<string[]>([]);
  const [duration, setDuration] = useState('');
  const [procedures, setProcedures] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [warrantyHas, setWarrantyHas] = useState(true);
  const [warrantyValue, setWarrantyValue] = useState('3');
  const [warrantyUnit, setWarrantyUnit] = useState<WarrantyUnit>('meses');
  const [warrantyType, setWarrantyType] = useState<WarrantyType>('corretivo');
  const [recEnabled, setRecEnabled] = useState(false);
  const [recFreq, setRecFreq] = useState<RecurrenceFreq>('mensal');
  const [execDate, setExecDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [validityDate, setValidityDate] = useState('');
  const [equipmentIds, setEquipmentIds] = useState<string[]>([]);
  const [returnAt, setReturnAt] = useState('');
  const [photos, setPhotos] = useState<ServiceOrderPhoto[]>([]);
  const [touched, setTouched] = useState(false);
  const [filledFrom, setFilledFrom] = useState<number | null>(null);

  const cust = customers.find((c) => c.id === customerId);

  useEffect(() => {
    if (open) {
      const c0 = customers[0]?.id ?? '';
      setCustomerId(c0);
      setServiceTypeIds(serviceTypes[0] ? [serviceTypes[0].id] : []);
      setTechnicianIds(technicianUsers[0] ? [technicianUsers[0].id] : []);
      setSellerId(''); setStatus('em_andamento'); setAreaIds([]); setPestIds([]); setDuration(''); setProcedures('');
      setPaymentMethod(''); setWarrantyHas(true); setWarrantyValue('3'); setWarrantyUnit('meses'); setWarrantyType('corretivo');
      setRecEnabled(false); setRecFreq('mensal'); setExecDate(''); setDueDate(''); setValidityDate('');
      setEquipmentIds([]); setReturnAt(''); setPhotos([]); setTouched(false); setFilledFrom(null);
    }
  }, [open, customers, serviceTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Preenchimento inteligente: repete o último atendimento do cliente. */
  const applyHistory = (cid: string) => {
    const last = lastOrderForCustomer(cid);
    if (!last) { setFilledFrom(null); return; }
    setServiceTypeIds(last.serviceTypeIds?.length ? last.serviceTypeIds : (last.serviceTypeId ? [last.serviceTypeId] : []));
    setPestIds(last.pestIds ?? []);
    if (last.areaIds?.length) setAreaIds(last.areaIds);
    else if (last.areaTreated) { const names = last.areaTreated.split(',').map((s) => s.trim()); setAreaIds(areas.filter((a) => names.includes(a.name)).map((a) => a.id)); }
    else setAreaIds([]);
    if (last.technicianIds?.length) setTechnicianIds(last.technicianIds);
    if (last.paymentMethod) setPaymentMethod(last.paymentMethod);
    if (last.warranty) {
      setWarrantyHas(last.warranty.has);
      if (last.warranty.value) setWarrantyValue(String(last.warranty.value));
      if (last.warranty.unit) setWarrantyUnit(last.warranty.unit);
      if (last.warranty.type) setWarrantyType(last.warranty.type);
    }
    if (last.recurrence) { setRecEnabled(last.recurrence.enabled); if (last.recurrence.frequency) setRecFreq(last.recurrence.frequency); }
    setFilledFrom(last.number);
  };

  // Ao selecionar o cliente, tenta preencher a partir do histórico.
  useEffect(() => { if (open && customerId) applyHistory(customerId); }, [customerId, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFill = () => {
    setServiceTypeIds(serviceTypes[0] ? [serviceTypes[0].id] : []);
    setPestIds([]); setAreaIds([]); setPaymentMethod(''); setRecEnabled(false); setFilledFrom(null);
  };

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) =>
    setter((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));

  /** Cadastro rápido — evita sair da O.S. para incluir serviço/praga/área novos. */
  const quickAddServiceType = (name: string) => {
    const st: ServiceType = { id: uid('st'), orgId: 'org-namira', name, defaultDurationMin: 60, defaultPrice: 0, color: '#0ea5e9' };
    addServiceType(st);
    setServiceTypeIds((arr) => [...arr, st.id]);
    toast(`Serviço "${name}" cadastrado.`, { tone: 'success' });
  };
  const quickAddPest = (name: string) => {
    const p: Pest = { id: uid('pest'), orgId: 'org-namira', name };
    addPest(p);
    setPestIds((arr) => [...arr, p.id]);
    toast(`Praga "${name}" cadastrada.`, { tone: 'success' });
  };
  const quickAddArea = (name: string) => {
    const a: TreatedArea = { id: uid('area'), orgId: 'org-namira', name };
    addArea(a);
    setAreaIds((arr) => [...arr, a.id]);
    toast(`Área "${name}" cadastrada.`, { tone: 'success' });
  };

  // Produtos sugeridos: união dos produtos padrão dos serviços selecionados.
  const suggestedProducts = useMemo(() => {
    const map = new Map<string, number>();
    serviceTypeIds.forEach((stId) => {
      serviceTypes.find((s) => s.id === stId)?.defaultProducts?.forEach((dp) => {
        map.set(dp.productId, Math.max(map.get(dp.productId) ?? 0, dp.qty));
      });
    });
    return [...map.entries()].map(([productId, qty]) => ({ productId, qty }));
  }, [serviceTypeIds, serviceTypes]);

  const submit = () => {
    setTouched(true);
    if (!customerId) return;
    const now = new Date().toISOString();
    const input: ServiceOrderInput = {
      customerId,
      serviceTypeId: serviceTypeIds[0],
      serviceTypeIds,
      technicianId: technicianIds[0],
      technicianIds,
      sellerId: sellerId || undefined,
      status,
      areaIds,
      areaTreated: areaIds.map((id) => areas.find((a) => a.id === id)?.name).filter(Boolean).join(', ') || undefined,
      procedures: procedures.trim() || undefined,
      totalMinutes: duration ? Number(duration) : undefined,
      startedAt: status !== 'rascunho' ? now : undefined,
      finishedAt: status === 'concluida' ? now : undefined,
      pestIds,
      products: suggestedProducts.map((p) => ({ productId: p.productId, usedQty: p.qty })),
      paymentMethod: paymentMethod || undefined,
      warranty: { has: warrantyHas, value: warrantyHas ? Number(warrantyValue) || undefined : undefined, unit: warrantyHas ? warrantyUnit : undefined, type: warrantyHas ? warrantyType : undefined },
      recurrence: { enabled: recEnabled, frequency: recEnabled ? recFreq : undefined },
      executionDate: execDate ? new Date(execDate).toISOString() : undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      validityDate: validityDate ? new Date(validityDate).toISOString() : undefined,
      equipmentIds,
      photos: photos.length ? photos : undefined,
      hasCustomerSignature: false,
    };
    const so = add(input);
    // Retirada dos equipamentos utilizados (em uso, com previsão de devolução).
    const returnIso = returnAt ? new Date(returnAt).toISOString() : undefined;
    equipmentIds.forEach((id) => checkoutEquipment(id, {
      status: 'em_uso', checkedOutAt: now, checkedOutTo: technicianIds[0], checkedOutOsId: so.id, expectedReturnAt: returnIso,
    }));
    logChange('criação', 'ordem de serviço', `OS #${so.number} · ${getCustomer(customerId)?.name ?? ''}`, so.id);
    toast(`OS #${so.number} criada.`, { tone: 'success' });
    onCreated(so);
  };

  return (
    <Drawer open={open} onClose={onClose} title="Nova Ordem de Serviço" subtitle="Preenchimento rápido — serviços, pragas e áreas em toques" width="max-w-xl"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} leftIcon={<Check size={15} />} disabled={!customerId}>Criar OS</Button></div>}>
      <div className="space-y-5">
        <Field label="Cliente" required>
          <Combobox
            value={customerId}
            onChange={setCustomerId}
            placeholder="Selecione…"
            searchPlaceholder="Buscar cliente…"
            options={customers.map((c) => ({ value: c.id, label: c.name, sub: c.type === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física' }))}
          />
          {cust && <p className="mt-1 text-xs text-muted-foreground">{cust.type === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'}{cust.propertyType ? ` · ${cust.propertyType}` : ''}</p>}
          {touched && !customerId && <span className="mt-1 block text-xs text-danger">Selecione um cliente.</span>}
        </Field>

        {filledFrom != null && (
          <div className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft/40 p-2.5 text-xs text-brand">
            <Zap size={14} className="shrink-0" />
            <span className="flex-1">Preenchido automaticamente pelo último atendimento (OS #{filledFrom}). Revise e ajuste o que mudou.</span>
            <button onClick={clearFill} className="shrink-0 font-medium underline">Começar em branco</button>
          </div>
        )}

        <Field label="Serviços executados" hint="Toque para adicionar vários serviços à mesma OS">
          <div className="flex flex-wrap items-center gap-1.5">
            {serviceTypes.map((s) => <Chip key={s.id} active={serviceTypeIds.includes(s.id)} onClick={() => toggle(setServiceTypeIds, s.id)}>{s.name}</Chip>)}
            <QuickAddChip label="serviço" onAdd={quickAddServiceType} />
          </div>
        </Field>

        <Field label="Pragas combatidas">
          <div className="flex flex-wrap items-center gap-1.5">
            {pests.map((p) => <Chip key={p.id} active={pestIds.includes(p.id)} onClick={() => toggle(setPestIds, p.id)}>{p.name}</Chip>)}
            <QuickAddChip label="praga" onAdd={quickAddPest} />
          </div>
        </Field>

        <Field label="Áreas tratadas">
          <div className="flex flex-wrap items-center gap-1.5">
            {areas.map((a) => <Chip key={a.id} active={areaIds.includes(a.id)} onClick={() => toggle(setAreaIds, a.id)}>{a.name}</Chip>)}
            <QuickAddChip label="área" onAdd={quickAddArea} />
          </div>
        </Field>

        {suggestedProducts.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Produtos sugeridos (dos serviços)</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestedProducts.map((p) => <span key={p.productId} className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs">{getProduct(p.productId)?.name ?? p.productId} · {p.qty} {getProduct(p.productId)?.unit}</span>)}
            </div>
          </div>
        )}

        {/* Garantia */}
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Garantia</p>
            <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={warrantyHas} onChange={(e) => setWarrantyHas(e.target.checked)} className="h-4 w-4 rounded border-border" /> Com garantia</label>
          </div>
          {warrantyHas && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Prazo"><Input type="number" min={1} max={warrantyUnit === 'meses' ? 12 : 365} value={warrantyValue} onChange={(e) => setWarrantyValue(e.target.value)} /></Field>
              <Field label="Unidade"><Select value={warrantyUnit} onChange={(e) => setWarrantyUnit(e.target.value as WarrantyUnit)}><option value="dias">Dias</option><option value="meses">Meses</option></Select></Field>
              <Field label="Tipo"><Select value={warrantyType} onChange={(e) => setWarrantyType(e.target.value as WarrantyType)}>{(Object.keys(WARRANTY_TYPE_LABEL) as WarrantyType[]).map((t) => <option key={t} value={t}>{WARRANTY_TYPE_LABEL[t]}</option>)}</Select></Field>
            </div>
          )}
        </div>

        {/* Recorrência */}
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={recEnabled} onChange={(e) => setRecEnabled(e.target.checked)} className="h-4 w-4 rounded border-border" /> Serviço recorrente</label>
          {recEnabled && (
            <Select value={recFreq} onChange={(e) => setRecFreq(e.target.value as RecurrenceFreq)} className="mt-2">{(Object.keys(RECURRENCE_FREQ_LABEL) as RecurrenceFreq[]).map((r) => <option key={r} value={r}>{RECURRENCE_FREQ_LABEL[r]}</option>)}</Select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Forma de pagamento"><Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="">—</option>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field>
          <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value as ServiceOrderStatus)}>{(Object.keys(OS_STATUS_LABEL) as ServiceOrderStatus[]).map((s) => <option key={s} value={s}>{OS_STATUS_LABEL[s]}</option>)}</Select></Field>
          <Field label="Data de execução"><Input type="date" value={execDate} onChange={(e) => setExecDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
          <Field label="Vencimento"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
          <Field label="Validade do serviço"><Input type="date" value={validityDate} onChange={(e) => setValidityDate(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
          <Field label="Duração (min)"><Input type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="—" /></Field>
        </div>

        <Field label="Equipe — técnicos" hint="Selecione um ou mais técnicos">
          <div className="flex flex-wrap gap-1.5">
            {technicianUsers.map((t) => <Chip key={t.id} active={technicianIds.includes(t.id)} onClick={() => toggle(setTechnicianIds, t.id)}>{t.name.split(' ')[0]}</Chip>)}
          </div>
        </Field>
        <Field label="Vendedor responsável"><Select value={sellerId} onChange={(e) => setSellerId(e.target.value)}><option value="">—</option>{sellers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>

        <Field label="Equipamentos utilizados" hint="Busque pelo nome ou código — ficam marcados como 'em uso' até a devolução">
          <MultiCombobox
            values={equipmentIds}
            onChange={setEquipmentIds}
            placeholder="Buscar equipamento…"
            options={equipment.map((e) => ({ value: e.id, label: e.name, sub: e.code }))}
          />
        </Field>
        {equipmentIds.length > 0 && (
          <Field label="Previsão de devolução dos equipamentos"><Input type="datetime-local" value={returnAt} onChange={(e) => setReturnAt(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></Field>
        )}

        <Field label="Fotos (antes / durante / após)">
          <PhotoCapture photos={photos} onChange={setPhotos} />
        </Field>

        <Field label="Procedimentos / observações"><Textarea value={procedures} onChange={(e) => setProcedures(e.target.value)} placeholder="Descreva o que foi feito no atendimento…" /></Field>
      </div>
    </Drawer>
  );
}

/** Texto de emergência (CIT) configurado nas Configurações. */
function settingsEmergency(): string {
  const s = useSettingsStore.getState();
  return `${s.emergencyPhone}${s.emergencyInfo ? ` — ${s.emergencyInfo}` : ''}`;
}

/** Captura das assinaturas eletrônicas da OS (técnico e cliente) → PDF.
 *  Ao selecionar técnico/cliente que já têm assinatura cadastrada, ela é
 *  carregada automaticamente; uma assinatura nova (traço ou arquivo) fica
 *  registrada para reaproveitar nas próximas OS do mesmo técnico/cliente. */
function OsSignatures({ so }: { so: ServiceOrder }) {
  const update = useServiceOrdersStore((s) => s.update);
  const savedSignatures = useSettingsStore((s) => s.signatures);
  const setEntitySignature = useSettingsStore((s) => s.setUserSignature);
  const [techSig, setTechSig] = useState<string | undefined>(so.technicianSignature);
  const [custSig, setCustSig] = useState<string | undefined>(so.customerSignature);

  const techId = so.technicianIds?.[0] ?? so.technicianId;

  useEffect(() => {
    const storedTech = techId ? savedSignatures[techId] : undefined;
    const storedCust = savedSignatures[so.customerId];
    const nextTech = so.technicianSignature ?? storedTech;
    const nextCust = so.customerSignature ?? storedCust;
    setTechSig(nextTech);
    setCustSig(nextCust);
    // Grava na própria OS se veio de um cadastro salvo (sem exigir novo traço).
    if (!so.technicianSignature && storedTech) update(so.id, { technicianSignature: storedTech });
    if (!so.customerSignature && storedCust) update(so.id, { customerSignature: storedCust, hasCustomerSignature: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [so.id, techId]);

  const saveTech = (d?: string) => {
    setTechSig(d);
    update(so.id, { technicianSignature: d });
    if (d && techId) setEntitySignature(techId, d);
  };
  const saveCust = (d?: string) => {
    setCustSig(d);
    update(so.id, { customerSignature: d, hasCustomerSignature: !!d });
    if (d) setEntitySignature(so.customerId, d);
  };

  return (
    <Section title="Assinaturas eletrônicas">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SignaturePad key={`tech-${so.id}-${techId}`} label="Técnico" value={techSig} onChange={saveTech} height={130} />
        <SignaturePad key={`cust-${so.id}`} label="Cliente" value={custSig} onChange={saveCust} height={130} />
      </div>
    </Section>
  );
}

/** Emissão de NFS-e a partir da OS concluída (Governo · NFS-e Nacional / simulação). */
function FiscalSection({ so }: { so: ServiceOrder }) {
  const { invoices, emitFiscal } = useInvoicesStore();
  const fiscal = useSettingsStore((s) => s.fiscal);
  const invoice = invoices.find((i) => i.serviceOrderId === so.id);
  const customer = getCustomer(so.customerId);
  const svc = getServiceType(so.serviceTypeId);
  const [emitting, setEmitting] = useState(false);

  const amount = svc?.defaultPrice ?? 300;
  const preview = useMemo(() => computeTaxes(amount, {
    issRate: fiscal.issRate, regime: fiscal.regime, issRetido: fiscal.issRetido, retencoes: fiscal.retencoes, inssRetido: fiscal.inssRetido, irrfRate: fiscal.irrfRate,
  }, customer?.type === 'pj'), [amount, fiscal, customer]);

  const doEmit = async () => {
    setEmitting(true);
    try {
      const inv = await emitFiscal(
        { serviceOrderId: so.id, customerId: so.customerId, description: `${svc?.name ?? 'Serviço'} · ${customer?.name ?? ''} (item ${fiscal.itemListaServico})`, amount },
        fiscal,
        { documento: customer?.document, nome: customer?.name, pessoaJuridica: customer?.type === 'pj' },
      );
      logChange('emissão', 'fiscal', `NFS-e #${inv.number} (${inv.provider}) · ${customer?.name ?? ''}`, so.id);
      toast(inv.status === 'emitida' ? `NFS-e #${inv.number} emitida (${fiscal.provider === 'governo-nacional' ? 'NFS-e Nacional' : 'simulação'}).` : `NFS-e rejeitada: ${inv.message}`, { tone: inv.status === 'emitida' ? 'success' : 'danger' });
    } finally {
      setEmitting(false);
    }
  };

  const providerLabel = fiscal.provider === 'governo-nacional' ? (fiscal.backendUrl ? 'Governo · NFS-e Nacional' : 'Governo · NFS-e Nacional (simulação — sem backend)') : 'Simulação';

  return (
    <Section title="Fiscal (NFS-e)">
      {so.status !== 'concluida' ? (
        <p className="text-sm text-muted-foreground">A emissão da NFS-e fica disponível após a conclusão do serviço.</p>
      ) : invoice ? (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">NFS-e #{invoice.number} · série {invoice.series}</p>
              <p className="text-xs text-muted-foreground">Emitida em {new Date(invoice.issuedAt).toLocaleDateString('pt-BR')} · {invoice.provider === 'governo-nacional' ? 'NFS-e Nacional' : 'simulação'}</p>
            </div>
            <Badge tone={invoice.status === 'emitida' ? 'success' : 'danger'} dot>{invoice.status === 'emitida' ? 'Emitida' : invoice.status === 'rejeitada' ? 'Rejeitada' : 'Cancelada'}</Badge>
          </div>
          {invoice.accessKey && <p className="mt-1 break-all text-[11px] text-muted-foreground">Chave: {invoice.accessKey}{invoice.verificationCode ? ` · Cód. verificação: ${invoice.verificationCode}` : ''}</p>}
          {invoice.taxes && <TaxBreakdown amount={invoice.amount} t={invoice.taxes} />}
          {invoice.message && <p className="mt-1 text-[11px] text-warning">{invoice.message}</p>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" leftIcon={<Download size={14} />} onClick={() => printNfse(invoice, customer)}>PDF</Button>
            <Button size="sm" variant="outline" leftIcon={<FileCode size={14} />} onClick={() => downloadNfseXml(invoice, customer)}>XML</Button>
            <Button size="sm" variant="ghost" onClick={() => toast('NFS-e enviada ao cliente (simulação).', { tone: 'success' })}>Enviar ao cliente</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Prévia da tributação · {providerLabel}</p>
            <TaxBreakdown amount={amount} t={preview} />
          </div>
          <Button leftIcon={<Receipt size={15} />} onClick={doEmit} disabled={emitting}>{emitting ? 'Emitindo…' : 'Emitir NFS-e'}</Button>
        </div>
      )}
    </Section>
  );
}

/** Detalhamento tributário (ISS + retenções + líquido). */
function TaxBreakdown({ amount, t }: { amount: number; t: import('@/domain/types').InvoiceTaxes }) {
  const row = (label: string, v: number, neg = false) => v ? <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className={neg ? 'text-danger' : 'text-foreground'}>{neg ? '−' : ''}{formatCurrency(v)}</span></div> : null;
  return (
    <div className="mt-2 space-y-0.5 text-xs">
      <div className="flex justify-between"><span className="text-muted-foreground">Valor do serviço</span><span className="font-medium text-foreground">{formatCurrency(amount)}</span></div>
      {row(`ISS (${(t.issRate * 100).toFixed(1)}%)${t.issRetido ? ' retido' : ''}`, t.iss, t.issRetido)}
      {row('IRRF', t.irrf, true)}
      {row('INSS', t.inss, true)}
      {row('PIS', t.pis, true)}
      {row('COFINS', t.cofins, true)}
      {row('CSLL', t.csll, true)}
      <div className="flex justify-between border-t border-border/60 pt-0.5 font-semibold"><span className="text-foreground">Líquido a receber</span><span className="text-brand">{formatCurrency(t.net)}</span></div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{title}</p>{children}</div>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/40 p-2.5"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p></div>;
}
